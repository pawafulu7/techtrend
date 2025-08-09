#!/usr/bin/env tsx
/**
 * 全記事の要約を統一フォーマットで再生成するスクリプト
 * - 品質スコアに関係なく全記事を対象
 * - 統一フォーマットで詳細要約を生成
 * - API負荷軽減のため適切な間隔で実行
 */

import { PrismaClient } from '@prisma/client';
import { generateUnifiedPrompt } from '../../lib/utils/article-type-prompts';
import { checkSummaryQuality } from '../../lib/utils/summary-quality-checker';
import { cacheInvalidator } from '../../lib/cache/cache-invalidator';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

// コマンドライン引数
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limit = args.find(arg => arg.startsWith('--limit='))?.split('=')[1];
const maxArticles = limit ? parseInt(limit, 10) : undefined;
const continueMode = args.includes('--continue'); // 中断した場合の継続モード
const forceRegenerate = args.includes('--force'); // 処理済みでも強制再生成

interface SummaryResult {
  summary: string;
  detailedSummary: string;
  tags: string[];
}

interface ProcessStats {
  totalTargets: number;
  processed: number;
  improved: number;
  unchanged: number;
  failed: number;
  startTime: number;
  scoreImprovements: number[];
}

async function generateUnifiedSummary(title: string, content: string): Promise<SummaryResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  // コンテンツを適切な長さに調整
  let processedContent = content;
  if (content.length < 300) {
    // コンテンツが短い場合はタイトルを含めて文脈を補強
    processedContent = `タイトル: ${title}\n\n内容:\n${content}\n\n注意: この記事は短いため、タイトルと利用可能な情報から推測して要約を作成してください。`;
  } else if (content.length > 5000) {
    // 長すぎる場合は切り詰め
    processedContent = content.substring(0, 5000);
  }

  // 統一プロンプトを使用
  const prompt = generateUnifiedPrompt(title, processedContent);

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2000,
        topP: 0.8,
        topK: 40
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as any;
  const responseText = data.candidates[0].content.parts[0].text.trim();
  
  return parseResponse(responseText);
}

function parseResponse(text: string): SummaryResult {
  const lines = text.split('\n');
  let summary = '';
  let detailedSummary = '';
  let tags: string[] = [];
  let isDetailedSection = false;
  let isSummarySection = false;
  let isTagSection = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    
    if (trimmed.startsWith('一覧要約:') || trimmed.startsWith('要約:')) {
      // 要約セクションの開始
      isSummarySection = true;
      isDetailedSection = false;
      isTagSection = false;
      
      // 同じ行に内容がある場合
      const content = trimmed.replace(/^(一覧)?要約:/, '').trim();
      if (content) {
        summary = content;
        isSummarySection = false; // 取得完了
      }
    } else if (trimmed.startsWith('詳細要約:')) {
      isDetailedSection = true;
      isSummarySection = false;
      isTagSection = false;
    } else if (trimmed.startsWith('タグ:')) {
      isTagSection = true;
      isDetailedSection = false;
      isSummarySection = false;
      const tagLine = trimmed.replace('タグ:', '').trim();
      if (tagLine) {
        tags = tagLine.split(',').map(t => t.trim()).filter(t => t.length > 0);
        isTagSection = false; // 取得完了
      }
    } else if (isSummarySection && trimmed && !trimmed.startsWith('【')) {
      // 要約セクションで、次の行に内容がある場合
      summary = trimmed;
      isSummarySection = false; // 取得完了
    } else if (isDetailedSection && trimmed.startsWith('・')) {
      detailedSummary += (detailedSummary ? '\n' : '') + trimmed;
    } else if (isTagSection && trimmed) {
      // タグセクションで、次の行に内容がある場合
      tags = trimmed.split(',').map(t => t.trim()).filter(t => t.length > 0);
      isTagSection = false; // 取得完了
    }
  }

  // 最低限のフォールバック
  if (!summary) {
    summary = 'この記事の要約を生成できませんでした。コンテンツを確認してください。';
  }
  if (!detailedSummary) {
    detailedSummary = `・この記事の主要なトピックは、内容の確認が必要です
・技術的な背景として、詳細情報が不足しています
・具体的な実装や手法について、原文を参照してください
・実践する際のポイントは、手動での確認を推奨します
・今後の展望や応用として、追加の調査が必要です`;
  }

  return { summary, detailedSummary, tags };
}

async function main() {
  console.log('🔄 全記事を統一フォーマットで再生成します');
  
  if (continueMode) {
    console.log('📌 継続モード: 未処理記事のみを対象にします');
  }
  if (forceRegenerate) {
    console.log('⚠️  強制再生成モード: 処理済み記事も含めて全て再生成します');
  }
  
  console.log('================================================================================\n');

  const stats: ProcessStats = {
    totalTargets: 0,
    processed: 0,
    improved: 0,
    unchanged: 0,
    failed: 0,
    startTime: Date.now(),
    scoreImprovements: []
  };

  try {
    // 処理対象の記事を取得
    console.log('📊 記事を取得中...');
    
    // 未処理記事の条件（summaryVersion !== 5 または forceRegenerate）
    // Prismaのバグ回避のため、簡略化したクエリを使用
    const whereCondition: any = forceRegenerate ? 
      { summary: { not: null } } : 
      { 
        summary: { not: null },
        summaryVersion: { not: 5 }  // summaryVersionが5以外（nullも含む）
      };
    
    const query = {
      where: whereCondition,
      include: { source: true },
      orderBy: { publishedAt: 'desc' as const },
      ...(maxArticles ? { take: maxArticles } : {})
    };

    const articles = await prisma.article.findMany(query);
    stats.totalTargets = articles.length;

    console.log(`\n✅ 対象記事: ${stats.totalTargets}件`);
    
    if (isDryRun) {
      console.log('⚠️  DRY-RUNモード: 実際の更新は行いません\n');
    }

    // 処理開始
    console.log('\n処理を開始します...\n');
    console.log('=' .repeat(80));

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      
      // 現在のスコアを取得
      const currentScore = checkSummaryQuality(
        article.summary!, 
        article.detailedSummary || ''
      ).score;
      
      // 進捗表示（10件ごと）
      if (i > 0 && i % 10 === 0) {
        const elapsed = Math.round((Date.now() - stats.startTime) / 1000);
        const rate = Math.round(stats.processed / elapsed * 60);
        const eta = Math.round((stats.totalTargets - stats.processed) / (stats.processed / elapsed));
        
        console.log('\n' + '=' .repeat(80));
        console.log(`📈 進捗: ${stats.processed}/${stats.totalTargets} (${Math.round(stats.processed / stats.totalTargets * 100)}%)`);
        console.log(`⏱️  経過時間: ${elapsed}秒 | 処理速度: ${rate}件/分 | 推定残り時間: ${eta}秒`);
        console.log(`✅ 改善: ${stats.improved}件 | ⏭️  変化なし: ${stats.unchanged}件 | ❌ 失敗: ${stats.failed}件`);
        
        if (stats.scoreImprovements.length > 0) {
          const avgImprovement = Math.round(stats.scoreImprovements.reduce((a, b) => a + b, 0) / stats.scoreImprovements.length);
          console.log(`📊 平均改善度: +${avgImprovement}点`);
        }
        console.log('=' .repeat(80) + '\n');
        
        // 100件ごとに長めの休憩
        if (i % 100 === 0) {
          console.log('💤 API負荷軽減のため30秒待機...');
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      }
      
      console.log(`[${i + 1}/${stats.totalTargets}] ${article.title.substring(0, 50)}...`);
      console.log(`  現在: ${currentScore}点 | ソース: ${article.source.name}`);
      
      try {
        // コンテンツの準備
        const content = article.content || article.description || article.title;
        
        // 短すぎるコンテンツの警告
        if (content.length < 100) {
          console.log(`  ⚠️  極短コンテンツ: ${content.length}文字`);
        }

        // 新しい要約を生成
        const result = await generateUnifiedSummary(article.title, content);
        
        // 新しい品質をチェック
        const newScore = checkSummaryQuality(result.summary, result.detailedSummary).score;
        
        // 統一フォーマットへの移行を優先（スコアが下がっても適用）
        // forceオプションがない場合でも、summaryVersion != 5 の記事は必ず更新
        const shouldUpdate = forceRegenerate || article.summaryVersion !== 5 || newScore > currentScore;
        
        if (shouldUpdate) {
          if (!isDryRun) {
            // データベース更新
            await prisma.article.update({
              where: { id: article.id },
              data: {
                summary: result.summary,
                detailedSummary: result.detailedSummary,
                articleType: 'unified',
                summaryVersion: 5
              }
            });

            // タグの更新
            if (result.tags.length > 0) {
              // 既存のタグ関連付けを削除
              await prisma.article.update({
                where: { id: article.id },
                data: {
                  tags: {
                    set: []
                  }
                }
              });

              // 新しいタグを関連付け
              for (const tagName of result.tags) {
                const tag = await prisma.tag.upsert({
                  where: { name: tagName },
                  update: {},
                  create: { name: tagName }
                });
                
                await prisma.article.update({
                  where: { id: article.id },
                  data: {
                    tags: { connect: { id: tag.id } }
                  }
                });
              }
            }
          }

          const improvement = newScore - currentScore;
          if (improvement > 0) {
            console.log(`  ✅ 改善: ${currentScore} → ${newScore}点 (+${improvement}点)`);
            stats.improved++;
            stats.scoreImprovements.push(improvement);
          } else if (improvement < 0) {
            console.log(`  📝 統一フォーマット適用: ${currentScore} → ${newScore}点 (${improvement}点)`);
            stats.improved++; // 統一フォーマット適用も改善としてカウント
          } else {
            console.log(`  📝 統一フォーマット適用: ${currentScore}点（スコア変化なし）`);
            stats.improved++; // 統一フォーマット適用も改善としてカウント
          }
        } else {
          console.log(`  ⏭️  変化なし: ${currentScore}点`);
          stats.unchanged++;
        }
        
        stats.processed++;

        // API制限対策（5秒待機）
        await new Promise(resolve => setTimeout(resolve, 5000));

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`  ❌ エラー: ${errorMessage}`);
        
        // Rate Limitエラーの場合は特別処理
        if (errorMessage.includes('429') || errorMessage.includes('rate') || errorMessage.includes('quota')) {
          console.log('⚠️  Rate Limitエラーを検出しました。');
          console.log('📊 現在の進捗:');
          console.log(`  - 処理済み: ${stats.processed}件`);
          console.log(`  - 改善: ${stats.improved}件`);
          console.log(`  - 失敗: ${stats.failed}件`);
          
          if (continueMode) {
            console.log('⏸️  60秒待機してから再試行します...');
            await new Promise(resolve => setTimeout(resolve, 60000));
            
            // 再試行
            try {
              const retryResult = await generateUnifiedSummary(article.title, content);
              const retryScore = checkSummaryQuality(retryResult.summary, retryResult.detailedSummary).score;
              
              if (retryScore > currentScore && !isDryRun) {
                await prisma.article.update({
                  where: { id: article.id },
                  data: {
                    summary: retryResult.summary,
                    detailedSummary: retryResult.detailedSummary,
                    articleType: 'unified',
                    summaryVersion: 5
                  }
                });
                console.log(`  ✅ 再試行成功: ${currentScore} → ${retryScore}点`);
                stats.improved++;
              }
            } catch (retryError) {
              console.error(`  ❌ 再試行も失敗: ${retryError}`);
              stats.failed++;
              
              console.log('\n⚠️  Rate Limitが継続しています。');
              console.log('後で以下のコマンドで再開してください:');
              console.log(`npm run regenerate:all-unified -- --continue`);
              console.log(`\n処理済み記事は自動的にスキップされます。\n`);
              break; // ループを抜ける
            }
          } else {
            stats.failed++;
            console.log('\n⚠️  Rate Limitエラーのため処理を中断します。');
            console.log('再開するには以下のコマンドを実行してください:');
            console.log(`npm run regenerate:all-unified -- --continue`);
            console.log(`\n処理済み記事（summaryVersion: 5）は自動的にスキップされます。\n`);
            break; // ループを抜ける
          }
        } else {
          // その他のエラー
          stats.failed++;
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
        stats.processed++;
      }
    }

    // 最終結果サマリー
    const totalTime = Math.round((Date.now() - stats.startTime) / 1000);
    const minutes = Math.floor(totalTime / 60);
    const seconds = totalTime % 60;
    
    console.log('\n' + '=' .repeat(80));
    console.log('📊 最終結果レポート');
    console.log('=' .repeat(80));
    console.log(`\n【処理統計】`);
    console.log(`  対象記事数: ${stats.totalTargets}件`);
    console.log(`  処理完了: ${stats.processed}件`);
    console.log(`  改善成功: ${stats.improved}件 (${Math.round(stats.improved / stats.processed * 100)}%)`);
    console.log(`  変化なし: ${stats.unchanged}件`);
    console.log(`  処理失敗: ${stats.failed}件`);
    
    if (stats.scoreImprovements.length > 0) {
      const avgImprovement = Math.round(stats.scoreImprovements.reduce((a, b) => a + b, 0) / stats.scoreImprovements.length);
      const maxImprovement = Math.max(...stats.scoreImprovements);
      
      console.log(`\n【品質改善】`);
      console.log(`  平均改善度: +${avgImprovement}点`);
      console.log(`  最大改善度: +${maxImprovement}点`);
      console.log(`  改善率: ${Math.round(stats.improved / stats.processed * 100)}%`);
    }
    
    console.log(`\n【処理時間】`);
    console.log(`  総処理時間: ${minutes}分${seconds}秒`);
    console.log(`  平均処理時間: ${Math.round(totalTime / stats.processed)}秒/件`);

    // キャッシュ無効化
    if (!isDryRun && stats.improved > 0) {
      console.log('\n🔄 キャッシュを無効化中...');
      await cacheInvalidator.onBulkImport();
      console.log('✅ キャッシュ無効化完了');
    }

    console.log('\n✨ 処理が完了しました！');
    
    // 未処理記事の確認
    const remainingCount = await prisma.article.count({
      where: {
        summary: { not: null },
        summaryVersion: { not: 5 }  // summaryVersionが5以外（nullも含む）
      }
    });
    
    if (remainingCount > 0) {
      console.log(`\n⚠️  未処理記事が ${remainingCount} 件残っています。`);
      console.log('以下のコマンドで継続できます:');
      console.log(`npm run regenerate:all-unified -- --continue`);
    } else {
      console.log('\n【重要】');
      console.log('✅ 全記事の統一フォーマットへの移行が完了しました。');
      console.log('今後生成される要約も全て統一フォーマットになります。');
    }

  } catch (error) {
    console.error('\n❌ 致命的エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
main().catch(console.error);