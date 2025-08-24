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
import { getUnifiedSummaryService } from '../../lib/ai/unified-summary-service';
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
  // 統一サービスを使用
  const service = getUnifiedSummaryService();
  
  // コンテンツを適切な長さに調整
  let processedContent = content;
  if (content.length < 300) {
    // コンテンツが短い場合はタイトルを含めて文脈を補強
    processedContent = `タイトル: ${title}\n\n内容:\n${content}\n\n注意: この記事は短いため、タイトルと利用可能な情報から推測して要約を作成してください。`;
  } else if (content.length > 5000) {
    // 長すぎる場合は切り詰め
    processedContent = content.substring(0, 5000);
  }

  const result = await service.generate(title, processedContent, {
    maxRetries: 3,
    minQualityScore: 40
  });
  
  // 重複チェック
  const finalSummary = result.summary;
  let finalDetailedSummary = result.detailedSummary;
  
  if (finalSummary && finalDetailedSummary && finalSummary === finalDetailedSummary) {
    console.warn('⚠️ 警告: 一覧要約と詳細要約が同一です。詳細要約を空にしてフォールバック処理に委ねます。');
    finalDetailedSummary = '';
  }
  
  // 詳細要約が空の場合の警告
  if (!finalDetailedSummary || finalDetailedSummary.length === 0) {
    console.error('❌ エラー: 詳細要約が空です。APIレスポンスに問題がある可能性があります。');
    // フォールバック: summaryから詳細要約を生成
    if (finalSummary && finalSummary.length > 100) {
      finalDetailedSummary = `・${finalSummary}\n・技術的な詳細については元記事を参照してください`;
      console.error('📝 フォールバック: 一覧要約から詳細要約を生成しました');
    }
  }
  
  // デバッグログ
  if (process.env.DEBUG_REGENERATE) {
    console.error('=== DEBUG: API Response ===');
    console.error('Summary length:', finalSummary.length);
    console.error('Summary preview:', finalSummary.substring(0, 100));
    console.error('DetailedSummary length:', finalDetailedSummary.length);
    console.error('DetailedSummary preview:', finalDetailedSummary.substring(0, 100));
    console.error('===========================');
  }
  
  return {
    summary: finalSummary,
    detailedSummary: finalDetailedSummary,
    tags: result.tags
  };
}

// parseResponseは統一サービス内で処理されるため削除

async function main() {
  console.error('🔄 全記事を統一フォーマットで再生成します');
  
  if (continueMode) {
    console.error('📌 継続モード: 未処理記事のみを対象にします');
  }
  if (forceRegenerate) {
    console.error('⚠️  強制再生成モード: 処理済み記事も含めて全て再生成します');
  }
  
  console.error('================================================================================\n');

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
    console.error('📊 記事を取得中...');
    
    // 未処理記事の条件（summaryVersion < 6 または forceRegenerate）
    // Prismaのバグ回避のため、簡略化したクエリを使用
    const whereCondition: any = forceRegenerate ? 
      { summary: { not: null } } : 
      { 
        summary: { not: null },
        summaryVersion: { lt: 6 }  // summaryVersionが6未満（nullと5を含む）
      };
    
    const query = {
      where: whereCondition,
      include: { source: true },
      orderBy: { publishedAt: 'desc' as const },
      ...(maxArticles ? { take: maxArticles } : {})
    };

    const articles = await prisma.article.findMany(query);
    stats.totalTargets = articles.length;

    console.error(`\n✅ 対象記事: ${stats.totalTargets}件`);
    
    if (isDryRun) {
      console.error('⚠️  DRY-RUNモード: 実際の更新は行いません\n');
    }

    // 処理開始
    console.error('\n処理を開始します...\n');
    console.error('=' .repeat(80));

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
        
        console.error('\n' + '=' .repeat(80));
        console.error(`📈 進捗: ${stats.processed}/${stats.totalTargets} (${Math.round(stats.processed / stats.totalTargets * 100)}%)`);
        console.error(`⏱️  経過時間: ${elapsed}秒 | 処理速度: ${rate}件/分 | 推定残り時間: ${eta}秒`);
        console.error(`✅ 改善: ${stats.improved}件 | ⏭️  変化なし: ${stats.unchanged}件 | ❌ 失敗: ${stats.failed}件`);
        
        if (stats.scoreImprovements.length > 0) {
          const avgImprovement = Math.round(stats.scoreImprovements.reduce((a, b) => a + b, 0) / stats.scoreImprovements.length);
          console.error(`📊 平均改善度: +${avgImprovement}点`);
        }
        console.error('=' .repeat(80) + '\n');
        
        // 100件ごとに長めの休憩
        if (i % 100 === 0) {
          console.error('💤 API負荷軽減のため30秒待機...');
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      }
      
      console.error(`[${i + 1}/${stats.totalTargets}] ${article.title.substring(0, 50)}...`);
      console.error(`  現在: ${currentScore}点 | ソース: ${article.source.name}`);
      
      try {
        // コンテンツの準備
        const content = article.content || article.title;
        
        // 短すぎるコンテンツの警告
        if (content.length < 100) {
          console.error(`  ⚠️  極短コンテンツ: ${content.length}文字`);
        }

        // 新しい要約を生成
        const result = await generateUnifiedSummary(article.title, content);
        
        // 新しい品質をチェック
        const newScore = checkSummaryQuality(result.summary, result.detailedSummary).score;
        
        // 統一フォーマットへの移行を優先（スコアが下がっても適用）
        // forceオプションがない場合でも、summaryVersion != 6 の記事は必ず更新
        const shouldUpdate = forceRegenerate || article.summaryVersion !== 6 || newScore > currentScore;
        
        if (shouldUpdate) {
          if (!isDryRun) {
            // データベース更新
            await prisma.article.update({
              where: { id: article.id },
              data: {
                summary: result.summary,
                detailedSummary: result.detailedSummary,
                articleType: 'unified',
                summaryVersion: getUnifiedSummaryService().getSummaryVersion()
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
            console.error(`  ✅ 改善: ${currentScore} → ${newScore}点 (+${improvement}点)`);
            stats.improved++;
            stats.scoreImprovements.push(improvement);
          } else if (improvement < 0) {
            console.error(`  📝 統一フォーマット適用: ${currentScore} → ${newScore}点 (${improvement}点)`);
            stats.improved++; // 統一フォーマット適用も改善としてカウント
          } else {
            console.error(`  📝 統一フォーマット適用: ${currentScore}点（スコア変化なし）`);
            stats.improved++; // 統一フォーマット適用も改善としてカウント
          }
        } else {
          console.error(`  ⏭️  変化なし: ${currentScore}点`);
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
          console.error('⚠️  Rate Limitエラーを検出しました。');
          console.error('📊 現在の進捗:');
          console.error(`  - 処理済み: ${stats.processed}件`);
          console.error(`  - 改善: ${stats.improved}件`);
          console.error(`  - 失敗: ${stats.failed}件`);
          
          if (continueMode) {
            console.error('⏸️  60秒待機してから再試行します...');
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
                    summaryVersion: getUnifiedSummaryService().getSummaryVersion()
                  }
                });
                console.error(`  ✅ 再試行成功: ${currentScore} → ${retryScore}点`);
                stats.improved++;
              }
            } catch (retryError) {
              console.error(`  ❌ 再試行も失敗: ${retryError}`);
              stats.failed++;
              
              console.error('\n⚠️  Rate Limitが継続しています。');
              console.error('後で以下のコマンドで再開してください:');
              console.error(`npm run regenerate:all-unified -- --continue`);
              console.error(`\n処理済み記事は自動的にスキップされます。\n`);
              break; // ループを抜ける
            }
          } else {
            stats.failed++;
            console.error('\n⚠️  Rate Limitエラーのため処理を中断します。');
            console.error('再開するには以下のコマンドを実行してください:');
            console.error(`npm run regenerate:all-unified -- --continue`);
            console.error(`\n処理済み記事（summaryVersion: 5）は自動的にスキップされます。\n`);
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
    
    console.error('\n' + '=' .repeat(80));
    console.error('📊 最終結果レポート');
    console.error('=' .repeat(80));
    console.error(`\n【処理統計】`);
    console.error(`  対象記事数: ${stats.totalTargets}件`);
    console.error(`  処理完了: ${stats.processed}件`);
    console.error(`  改善成功: ${stats.improved}件 (${Math.round(stats.improved / stats.processed * 100)}%)`);
    console.error(`  変化なし: ${stats.unchanged}件`);
    console.error(`  処理失敗: ${stats.failed}件`);
    
    if (stats.scoreImprovements.length > 0) {
      const avgImprovement = Math.round(stats.scoreImprovements.reduce((a, b) => a + b, 0) / stats.scoreImprovements.length);
      const maxImprovement = Math.max(...stats.scoreImprovements);
      
      console.error(`\n【品質改善】`);
      console.error(`  平均改善度: +${avgImprovement}点`);
      console.error(`  最大改善度: +${maxImprovement}点`);
      console.error(`  改善率: ${Math.round(stats.improved / stats.processed * 100)}%`);
    }
    
    console.error(`\n【処理時間】`);
    console.error(`  総処理時間: ${minutes}分${seconds}秒`);
    console.error(`  平均処理時間: ${Math.round(totalTime / stats.processed)}秒/件`);

    // キャッシュ無効化
    if (!isDryRun && stats.improved > 0) {
      console.error('\n🔄 キャッシュを無効化中...');
      await cacheInvalidator.onBulkImport();
      console.error('✅ キャッシュ無効化完了');
    }

    console.error('\n✨ 処理が完了しました！');
    
    // 未処理記事の確認
    const remainingCount = await prisma.article.count({
      where: {
        summary: { not: null },
        summaryVersion: { not: 5 }  // summaryVersionが5以外（nullも含む）
      }
    });
    
    if (remainingCount > 0) {
      console.error(`\n⚠️  未処理記事が ${remainingCount} 件残っています。`);
      console.error('以下のコマンドで継続できます:');
      console.error(`npm run regenerate:all-unified -- --continue`);
    } else {
      console.error('\n【重要】');
      console.error('✅ 全記事の統一フォーマットへの移行が完了しました。');
      console.error('今後生成される要約も全て統一フォーマットになります。');
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