import { PrismaClient, Article, Source } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

interface GenerateOptions {
  dryRun?: boolean;
  limit?: number;
  sourceFilter?: string;
  onlySampleCheck?: boolean;
}

interface GenerateResult {
  generated: number;
  errors: number;
  skipped: number;
}

// API統計情報を追跡
const apiStats = {
  attempts: 0,
  successes: 0,
  failures: 0,
  overloadErrors: 0,
  startTime: Date.now()
};

// タグ正規化マップ
const tagNormalizationMap: Record<string, string> = {
  'javascript': 'JavaScript',
  'js': 'JavaScript',
  'typescript': 'TypeScript',
  'ts': 'TypeScript',
  'react': 'React',
  'vue': 'Vue.js',
  'angular': 'Angular',
  'node': 'Node.js',
  'nodejs': 'Node.js',
  'python': 'Python',
  'docker': 'Docker',
  'kubernetes': 'Kubernetes',
  'k8s': 'Kubernetes',
  'aws': 'AWS',
  'gcp': 'GCP',
  'azure': 'Azure',
  'ai': 'AI',
  'ml': '機械学習',
  'github': 'GitHub',
  'git': 'Git',
};

// タグを正規化
function normalizeTag(tag: string): string {
  const lowerTag = tag.toLowerCase();
  return tagNormalizationMap[lowerTag] || tag;
}

// Gemini APIを使用してタグを生成
async function generateTags(title: string, content: string): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const prompt = `以下の技術記事に最も適切なタグを生成してください。

タイトル: ${title}
内容: ${content.substring(0, 4000)}

【要求事項】
- 技術記事の内容を正確に表す3-7個のタグを生成
- 具体的な技術名、フレームワーク名、概念名を使用
- 一般的すぎるタグ（例：プログラミング、開発）は避ける
- 記事の主要なトピックに焦点を当てる

【回答形式】
タグをカンマ区切りで記載してください。説明は不要です。
例: JavaScript, React, 状態管理, Redux, フロントエンド`;

  apiStats.attempts++;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 200,
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as any;
  const responseText = data.candidates[0].content.parts[0].text.trim();
  
  // タグをパース
  const tags = responseText.split(/[,、，]/)
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0 && tag.length <= 30)
    .map(tag => normalizeTag(tag))
    .slice(0, 7); // 最大7個に制限
  
  return tags;
}

// スリープ関数
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// プログレス表示
function showProgress(current: number, total: number, success: number, errors: number, skipped: number) {
  const percentage = Math.round((current / total) * 100);
  console.log(`\n📊 進捗: ${current}/${total} (${percentage}%)`);
  console.log(`   ✅ 成功: ${success} | ❌ エラー: ${errors} | ⏭️ スキップ: ${skipped}`);
}

// メイン処理
async function generateTagsOnly(options: GenerateOptions = {}): Promise<GenerateResult> {
  const {
    dryRun = false,
    limit = 0,
    sourceFilter = '',
    onlySampleCheck = false
  } = options;

  console.log('🏷️  既存記事のタグ生成を開始します...');
  
  if (dryRun) {
    console.log('⚠️  ドライランモードで実行中（実際の更新は行われません）');
  }

  try {
    // タグがない記事を取得
    const whereClause: any = {
      tags: {
        none: {}
      }
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
      include: { 
        source: true,
        tags: true 
      },
      orderBy: { publishedAt: 'desc' },
      take: limit || undefined
    }) as (Article & { source: Source; tags: any[] })[];

    if (articles.length === 0) {
      console.log('✅ タグがない記事はありません');
      return { generated: 0, errors: 0, skipped: 0 };
    }

    console.log(`📄 処理対象の記事数: ${articles.length}件`);

    if (onlySampleCheck) {
      // サンプルチェックモード
      console.log('\n🔍 サンプルチェックモード（最初の5件を表示）\n');
      
      for (let i = 0; i < Math.min(5, articles.length); i++) {
        const article = articles[i];
        console.log(`\n[${i + 1}] ${article.title}`);
        console.log(`   ソース: ${article.source.name}`);
        console.log(`   公開日: ${article.publishedAt.toISOString().split('T')[0]}`);
        console.log(`   タグ: なし`);
      }
      
      return { generated: 0, errors: 0, skipped: 0 };
    }

    let generatedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const batchSize = 10;
    const MAX_RETRIES = 3;

    // バッチ処理
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      console.log(`\n🔄 バッチ ${Math.floor(i / batchSize) + 1}/${Math.ceil(articles.length / batchSize)} を処理中...`);

      for (const article of batch) {
        const content = article.content || article.description || '';
        
        if (!content || content.length < 100) {
          console.log(`⏭️  スキップ: ${article.title.substring(0, 50)}... (コンテンツ不足)`);
          skippedCount++;
          continue;
        }

        let retryCount = 0;
        let success = false;

        while (retryCount < MAX_RETRIES && !success) {
          try {
            if (!dryRun) {
              // タグを生成
              const tags = await generateTags(article.title, content);
              
              if (tags.length > 0) {
                // 既存のタグを取得または作成
                const tagRecords = await Promise.all(
                  tags.map(async (tagName) => {
                    const existingTag = await prisma.tag.findUnique({
                      where: { name: tagName }
                    });

                    if (existingTag) {
                      return existingTag;
                    }

                    return await prisma.tag.create({
                      data: { name: tagName }
                    });
                  })
                );

                // 記事にタグを関連付ける
                await prisma.article.update({
                  where: { id: article.id },
                  data: {
                    tags: {
                      connect: tagRecords.map(tag => ({ id: tag.id }))
                    }
                  }
                });

                console.log(`✅ [${article.source.name}] ${article.title.substring(0, 40)}...`);
                console.log(`   タグ: ${tags.join(', ')}`);
              } else {
                console.log(`⚠️  [${article.source.name}] ${article.title.substring(0, 40)}... (タグ生成失敗)`);
              }
            } else {
              // ドライランモード
              console.log(`🔍 [${article.source.name}] ${article.title.substring(0, 40)}... (ドライラン)`);
            }

            generatedCount++;
            apiStats.successes++;
            success = true;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            if ((errorMessage.includes('503') || errorMessage.includes('overloaded')) && retryCount < MAX_RETRIES - 1) {
              retryCount++;
              apiStats.overloadErrors++;
              
              // エクスポネンシャルバックオフ
              const waitTime = 10000 * Math.pow(2, retryCount - 1);
              console.log(`   リトライ ${retryCount}/${MAX_RETRIES} - ${waitTime/1000}秒待機中...`);
              await sleep(waitTime);
              continue;
            }
            
            console.error(`❌ [${article.source.name}] ${article.title.substring(0, 40)}...`);
            console.error(`   エラー: ${errorMessage}`);
            errorCount++;
            apiStats.failures++;
            success = true; // エラーでもループを終了
          }
        }
      }

      // 進捗表示
      const processed = Math.min(i + batchSize, articles.length);
      showProgress(processed, articles.length, generatedCount, errorCount, skippedCount);

      // API レート制限対策
      if (i + batchSize < articles.length && !dryRun) {
        console.log('\n⏳ 次のバッチまで3秒待機中...');
        await sleep(3000);
      }
    }

    const duration = Math.round((Date.now() - apiStats.startTime) / 1000);
    const successRate = apiStats.attempts > 0 ? Math.round((apiStats.successes / apiStats.attempts) * 100) : 0;
    
    console.log(`\n📊 タグ生成完了:`);
    console.log(`   成功: ${generatedCount}件`);
    console.log(`   エラー: ${errorCount}件`);
    console.log(`   スキップ: ${skippedCount}件`);
    console.log(`   処理時間: ${duration}秒`);
    console.log(`\n📈 API統計:`);
    console.log(`   総試行回数: ${apiStats.attempts}`);
    console.log(`   成功: ${apiStats.successes}`);
    console.log(`   失敗: ${apiStats.failures}`);
    console.log(`   503エラー: ${apiStats.overloadErrors}`);
    console.log(`   成功率: ${successRate}%`);
    
    if (successRate < 50 && apiStats.attempts > 10) {
      console.log(`\n⚠️  警告: API成功率が${successRate}%と低いです。深夜の実行を推奨します。`);
    }

    return { generated: generatedCount, errors: errorCount, skipped: skippedCount };

  } catch (error) {
    console.error('❌ タグ生成エラー:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// コマンドライン引数の処理
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: GenerateOptions = {};
  
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
使用方法: npx tsx scripts/generate-tags-only.ts [オプション]

タグがない既存記事に対してタグを生成します。要約は変更しません。

オプション:
  --dry-run     実際の更新を行わずに処理内容を確認
  --limit N     処理する記事数を制限（例: --limit 10）
  --source NAME 特定のソースのみ処理（例: --source "Dev.to"）
  --sample      最初の5件の対象記事を表示して終了
  --help        このヘルプを表示

例:
  # ドライランで10件処理
  npx tsx scripts/generate-tags-only.ts --dry-run --limit 10
  
  # Dev.toの記事のみ処理
  npx tsx scripts/generate-tags-only.ts --source "Dev.to"
  
  # サンプル確認
  npx tsx scripts/generate-tags-only.ts --sample
  
  # 全記事にタグを生成（本番実行）
  npx tsx scripts/generate-tags-only.ts
        `);
        process.exit(0);
    }
  }
  
  generateTagsOnly(options)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { generateTagsOnly };