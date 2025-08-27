/**
 * 低品質記事の自動再生成スクリプト
 * 品質スコア70点未満の記事を自動的に再生成
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import { calculateQualityScore } from '../../lib/utils/quality-score';

const prisma = new PrismaClient();
const summaryService = new UnifiedSummaryService();

interface AutoRegenerateOptions {
  threshold?: number;           // 品質スコア閾値（デフォルト: 70）
  limit?: number;               // バッチサイズ制限（デフォルト: 10）
  priorityEnriched?: boolean;   // エンリッチメント済み優先（デフォルト: true）
  dryRun?: boolean;             // 実行せずに対象確認（デフォルト: false）
  verbose?: boolean;            // 詳細出力（デフォルト: false）
}

interface RegenerationResult {
  articleId: string;
  title: string;
  oldScore: number;
  newScore: number | null;
  success: boolean;
  error?: string;
}

async function autoRegenerateLowQuality(options: AutoRegenerateOptions = {}) {
  const {
    threshold = 70,
    limit = 10,
    priorityEnriched = true,
    dryRun = false,
    verbose = false,
  } = options;

  console.log('=== 低品質記事の自動再生成 ===');
  console.log(`開始時刻: ${new Date().toLocaleString('ja-JP')}`);
  console.log(`品質スコア閾値: ${threshold}点`);
  console.log(`バッチサイズ: ${limit}件`);
  console.log(`エンリッチメント済み優先: ${priorityEnriched}`);
  console.log(`ドライラン: ${dryRun}`);
  console.log('');

  try {
    // 低品質記事を取得
    const articles = await getLowQualityArticles(threshold, limit, priorityEnriched);
    
    if (articles.length === 0) {
      console.log('再生成対象の低品質記事はありません。');
      return {
        success: true,
        totalProcessed: 0,
        succeeded: 0,
        failed: 0,
        results: [],
      };
    }

    console.log(`対象記事: ${articles.length}件`);
    
    if (dryRun) {
      console.log('\n=== ドライラン: 対象記事一覧 ===');
      articles.forEach((article, index) => {
        console.log(`${index + 1}. ${article.title}`);
        console.log(`   スコア: ${article.qualityScore || 0}点`);
        console.log(`   エンリッチメント: ${article.content && article.content.length >= 2000 ? 'あり' : 'なし'}`);
      });
      return {
        success: true,
        totalProcessed: 0,
        succeeded: 0,
        failed: 0,
        results: [],
      };
    }

    // 再生成実行
    const results: RegenerationResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      
      if (verbose) {
        console.log(`\n[${i + 1}/${articles.length}] ${article.title}`);
        console.log(`  現在のスコア: ${article.qualityScore || 0}点`);
        console.log(`  コンテンツ長: ${article.content?.length || 0}文字`);
      } else {
        process.stdout.write(`処理中: ${i + 1}/${articles.length}\r`);
      }

      try {
        // 要約再生成
        const result = await summaryService.generate(
          article.title,
          article.content || article.url
        );

        if (result) {
          // データベース更新
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              summaryVersion: 8,
              articleType: 'unified',
            },
          });

          // 新しい品質スコアを計算（sourceを含む完全なarticleオブジェクトを渡す）
          const updatedArticle = {
            ...article,
            summary: result.summary,
            detailedSummary: result.detailedSummary || '',
          };
          const newScoreValue = calculateQualityScore(updatedArticle as any);

          // 品質スコアをデータベースに保存
          await prisma.article.update({
            where: { id: article.id },
            data: {
              qualityScore: newScoreValue,
            },
          });

          results.push({
            articleId: article.id,
            title: article.title,
            oldScore: article.qualityScore || 0,
            newScore: newScoreValue,
            success: true,
          });

          succeeded++;

          if (verbose) {
            console.log(`  ✅ 成功: 新スコア ${newScoreValue}点 (${newScoreValue - (article.qualityScore || 0) > 0 ? '+' : ''}${newScoreValue - (article.qualityScore || 0)}点)`);
          }
        } else {
          failed++;
          results.push({
            articleId: article.id,
            title: article.title,
            oldScore: article.qualityScore || 0,
            newScore: null,
            success: false,
            error: '要約生成失敗',
          });

          if (verbose) {
            console.log('  ❌ 要約生成失敗');
          }
        }

        // Rate limit対策
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        failed++;
        results.push({
          articleId: article.id,
          title: article.title,
          oldScore: article.qualityScore || 0,
          newScore: null,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });

        if (verbose) {
          console.error(`  ❌ エラー: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Rate limitエラーの場合は長めに待機
        if (error instanceof Error && error.message.includes('429')) {
          console.log('\nRate limit検出。60秒待機...');
          await new Promise(resolve => setTimeout(resolve, 60000));
        }
      }
    }

    if (!verbose) {
      console.log(); // 改行
    }

    // 結果サマリー
    console.log('\n=== 再生成結果 ===');
    console.log(`処理件数: ${articles.length}件`);
    console.log(`成功: ${succeeded}件`);
    console.log(`失敗: ${failed}件`);

    if (results.length > 0) {
      const successfulResults = results.filter(r => r.success && r.newScore !== null);
      if (successfulResults.length > 0) {
        const avgOldScore = successfulResults.reduce((sum, r) => sum + r.oldScore, 0) / successfulResults.length;
        const avgNewScore = successfulResults.reduce((sum, r) => sum + (r.newScore || 0), 0) / successfulResults.length;
        console.log(`平均スコア改善: ${avgOldScore.toFixed(1)}点 → ${avgNewScore.toFixed(1)}点 (+${(avgNewScore - avgOldScore).toFixed(1)}点)`);
      }
    }

    console.log(`\n完了時刻: ${new Date().toLocaleString('ja-JP')}`);

    return {
      success: true,
      totalProcessed: articles.length,
      succeeded,
      failed,
      results,
    };

  } catch (error) {
    console.error('エラーが発生しました:', error);
    return {
      success: false,
      totalProcessed: 0,
      succeeded: 0,
      failed: 0,
      results: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function getLowQualityArticles(
  threshold: number,
  limit: number,
  priorityEnriched: boolean
) {
  let articles = await prisma.article.findMany({
    where: {
      AND: [
        // 品質スコアが閾値未満（デフォルト0も含む）
        {
          qualityScore: {
            lt: threshold,
          },
        },
        // summaryVersionが最新でない
        {
          summaryVersion: {
            lt: 8,
          },
        },
      ],
    },
    include: {
      tags: true,
      source: true,  // calculateQualityScoreで必要
    },
    orderBy: {
      qualityScore: 'asc',
    },
    take: limit * 2, // エンリッチメント優先のために多めに取得
  });

  // エンリッチメント済みを優先する場合はソート
  if (priorityEnriched) {
    articles.sort((a, b) => {
      const aEnriched = a.content && a.content.length >= 2000;
      const bEnriched = b.content && b.content.length >= 2000;
      
      if (aEnriched && !bEnriched) return -1;
      if (!aEnriched && bEnriched) return 1;
      
      // 両方同じエンリッチメント状態なら品質スコア順
      return (a.qualityScore || 0) - (b.qualityScore || 0);
    });
    
    // limit件に制限
    articles = articles.slice(0, limit);
  }

  return articles;
}

// CLIとして実行された場合
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: AutoRegenerateOptions = {};

  // コマンドライン引数の解析
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--threshold':
        options.threshold = parseInt(args[++i], 10);
        break;
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--no-priority':
        options.priorityEnriched = false;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
        console.log(`
使用方法:
  npx tsx scripts/scheduled/auto-regenerate-low-quality.ts [オプション]

オプション:
  --threshold <number>   品質スコア閾値（デフォルト: 70）
  --limit <number>       バッチサイズ（デフォルト: 10）
  --no-priority          エンリッチメント済み優先を無効化
  --dry-run              実行せずに対象確認
  --verbose              詳細出力
  --help                 このヘルプを表示

例:
  # デフォルト設定で実行
  npx tsx scripts/scheduled/auto-regenerate-low-quality.ts
  
  # スコア60点未満、20件まで
  npx tsx scripts/scheduled/auto-regenerate-low-quality.ts --threshold 60 --limit 20
  
  # ドライラン
  npx tsx scripts/scheduled/auto-regenerate-low-quality.ts --dry-run --verbose
        `);
        process.exit(0);
    }
  }

  autoRegenerateLowQuality(options).catch(console.error);
}

export { autoRegenerateLowQuality, AutoRegenerateOptions, RegenerationResult };