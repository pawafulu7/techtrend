import { PrismaClient, Article } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

interface RegenerateOptions {
  dryRun?: boolean;
  limit?: number;
  sourceFilter?: string;
  onlySampleCheck?: boolean;
}

interface SummaryResult {
  summary: string;
  detailedSummary: string;
  originalSummaryLength?: number;
  originalDetailedSummaryLength?: number;
}

interface ProgressStats {
  total: number;
  processed: number;
  success: number;
  failed: number;
  skipped: number;
  startTime: number;
}

// プロンプト生成関数
async function generateNewSummaries(title: string, content: string): Promise<SummaryResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const prompt = `以下の技術記事を詳細に分析してください。

タイトル: ${title}
内容: ${content.substring(0, 4000)}

以下の観点で分析し、指定された形式で回答してください：

【回答形式】
※重要: 各セクションのラベル（要約:、詳細要約:）のみ記載し、それ以外の説明や指示文は一切含めないでください。

要約:
記事が解決する問題を100-120文字で要約。「〜の問題を〜により解決」の形式で、技術名と効果を含め句点で終了。文字数厳守。

詳細要約:
以下の要素を技術的に詳しく箇条書きで記載（各項目は「・」で開始、2-3文で説明）：
・記事の主題と技術的背景（使用技術、前提知識）
・解決しようとしている具体的な問題と現状の課題
・提示されている解決策の技術的アプローチ（アルゴリズム、設計パターン等）
・実装方法の詳細（具体的なコード例、設定方法、手順）
・期待される効果と性能改善の指標（数値があれば含める）
・実装時の注意点、制約事項、必要な環境`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800,
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as any;
  const responseText = data.candidates[0].content.parts[0].text.trim();
  
  return parseSummary(responseText);
}

// レスポンスのパース
function parseSummary(text: string): SummaryResult {
  const lines = text.split('\n');
  let summary = '';
  let detailedSummary = '';
  let isSummary = false;
  let isDetailedSummary = false;
  
  for (const line of lines) {
    if (line.match(/^要約[:：]/)) {
      isSummary = true;
      isDetailedSummary = false;
      summary = line.replace(/^要約[:：]\s*/, '').trim();
    } else if (line.match(/^詳細要約[:：]/)) {
      isSummary = false;
      isDetailedSummary = true;
      detailedSummary = line.replace(/^詳細要約[:：]\s*/, '').trim();
    } else if (isSummary && line.trim()) {
      summary += '\n' + line.trim();
    } else if (isDetailedSummary && line.trim()) {
      detailedSummary += '\n' + line.trim();
    }
  }
  
  // クリーンアップ
  summary = summary.trim();
  detailedSummary = detailedSummary.trim();
  
  // 文末に句点がない場合は追加
  if (summary && !summary.match(/[。！？]$/)) {
    summary += '。';
  }
  
  return { summary, detailedSummary };
}

// プログレス表示
function showProgress(stats: ProgressStats) {
  const percentage = stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0;
  const elapsed = Math.round((Date.now() - stats.startTime) / 1000);
  const eta = stats.processed > 0 ? Math.round((elapsed / stats.processed) * (stats.total - stats.processed)) : 0;
  
  console.log(`\n📊 進捗状況: ${stats.processed}/${stats.total} (${percentage}%)`);
  console.log(`   成功: ${stats.success} | 失敗: ${stats.failed} | スキップ: ${stats.skipped}`);
  console.log(`   経過時間: ${elapsed}秒 | 推定残り時間: ${eta}秒`);
}

// スリープ関数
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// メイン処理
async function regenerateSummaries(options: RegenerateOptions = {}) {
  const {
    dryRun = false,
    limit = 0,
    sourceFilter = '',
    onlySampleCheck = false
  } = options;

  console.log('🔄 既存記事の要約再生成を開始します...');
  
  if (dryRun) {
    console.log('⚠️  ドライランモードで実行中（実際の更新は行われません）');
  }
  
  try {
    // 対象記事の取得
    const whereClause: any = {
      summary: { not: null }
    };
    
    if (sourceFilter) {
      const source = await prisma.source.findFirst({
        where: { name: sourceFilter }
      });
      if (source) {
        whereClause.sourceId = source.id;
      }
    }
    
    const articles = await prisma.article.findMany({
      where: whereClause,
      include: { source: true },
      orderBy: { publishedAt: 'desc' },
      take: limit || undefined
    });
    
    if (articles.length === 0) {
      console.log('✅ 対象となる記事がありません');
      return;
    }
    
    console.log(`📄 対象記事数: ${articles.length}件`);
    
    if (onlySampleCheck) {
      // サンプルチェックモード
      console.log('\n🔍 サンプルチェックモード（最初の5件を表示）\n');
      
      for (let i = 0; i < Math.min(5, articles.length); i++) {
        const article = articles[i];
        console.log(`\n[${i + 1}] ${article.title}`);
        console.log(`ソース: ${article.source.name}`);
        console.log(`現在の要約（${article.summary?.length}文字）:`);
        console.log(`  ${article.summary}`);
        console.log(`現在の詳細要約（${article.detailedSummary?.length}文字）:`);
        console.log(`  ${article.detailedSummary?.substring(0, 200)}...`);
      }
      
      return;
    }
    
    // 統計情報の初期化
    const stats: ProgressStats = {
      total: articles.length,
      processed: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      startTime: Date.now()
    };
    
    const batchSize = 10;
    
    // バッチ処理
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      console.log(`\n🔄 バッチ ${Math.floor(i / batchSize) + 1}/${Math.ceil(articles.length / batchSize)} を処理中...`);
      
      for (const article of batch) {
        try {
          const content = article.content || article.description || '';
          
          if (!content || content.length < 100) {
            console.log(`⏭️  スキップ: ${article.title.substring(0, 50)}... (コンテンツ不足)`);
            stats.skipped++;
            stats.processed++;
            continue;
          }
          
          if (!dryRun) {
            const result = await generateNewSummaries(article.title, content);
            
            // 元の長さを保存
            result.originalSummaryLength = article.summary?.length;
            result.originalDetailedSummaryLength = article.detailedSummary?.length;
            
            // データベース更新
            await prisma.article.update({
              where: { id: article.id },
              data: {
                summary: result.summary,
                detailedSummary: result.detailedSummary
              }
            });
            
            console.log(`✅ 更新: ${article.title.substring(0, 50)}...`);
            console.log(`   要約: ${result.originalSummaryLength}文字 → ${result.summary.length}文字`);
            
            stats.success++;
          } else {
            console.log(`🔍 確認: ${article.title.substring(0, 50)}...`);
            stats.success++;
          }
          
        } catch (error) {
          console.error(`❌ エラー: ${article.title.substring(0, 50)}...`);
          console.error(`   ${error instanceof Error ? error.message : String(error)}`);
          stats.failed++;
        }
        
        stats.processed++;
        
        // 10件ごとに進捗表示
        if (stats.processed % 10 === 0) {
          showProgress(stats);
        }
        
        // API制限対策
        if (!dryRun && stats.processed < articles.length) {
          await sleep(3000); // 3秒待機
        }
      }
      
      // バッチ間の待機
      if (!dryRun && i + batchSize < articles.length) {
        console.log('\n⏳ 次のバッチまで10秒待機中...');
        await sleep(10000);
      }
    }
    
    // 最終結果表示
    showProgress(stats);
    
    const totalTime = Math.round((Date.now() - stats.startTime) / 1000);
    console.log(`\n✅ 処理完了！`);
    console.log(`   総処理時間: ${totalTime}秒`);
    console.log(`   成功率: ${Math.round((stats.success / stats.total) * 100)}%`);
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// コマンドライン引数の処理
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: RegenerateOptions = {};
  
  // 引数のパース
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--limit':
        options.limit = parseInt(args[++i]);
        break;
      case '--source':
        options.sourceFilter = args[++i];
        break;
      case '--sample':
        options.onlySampleCheck = true;
        break;
      case '--help':
        console.log(`
使用方法: npx tsx scripts/regenerateSummaries.ts [オプション]

オプション:
  --dry-run     実際の更新を行わずに処理内容を確認
  --limit N     処理する記事数を制限（例: --limit 10）
  --source NAME 特定のソースのみ処理（例: --source "Dev.to"）
  --sample      最初の5件の現在の要約を表示して終了
  --help        このヘルプを表示

例:
  # ドライランで10件処理
  npx tsx scripts/regenerateSummaries.ts --dry-run --limit 10
  
  # Dev.toの記事のみ処理
  npx tsx scripts/regenerateSummaries.ts --source "Dev.to"
  
  # サンプル確認
  npx tsx scripts/regenerateSummaries.ts --sample
        `);
        process.exit(0);
    }
  }
  
  regenerateSummaries(options)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { regenerateSummaries };