import { PrismaClient, Prisma } from '@prisma/client';
import { calculateQualityScore, checkCategoryQuality } from '@/lib/utils/quality-score';
import { getLastProcessedTime, saveProcessingStatus } from '../utils/processing-status';

const prisma = new PrismaClient();

interface Options {
  command: 'calculate' | 'fix-zero' | 'recalculate';
  source?: string;
  batch?: number;
  dryRun?: boolean;
  force?: boolean;
}

// コマンドライン引数を解析
function parseArgs(args: string[]): Options {
  const options: Options = {
    command: 'calculate',
    batch: 100
  };

  // デフォルトコマンドの判定
  if (args.length === 0 || !['calculate', 'fix-zero', 'recalculate'].includes(args[0])) {
    options.command = 'calculate';
  } else {
    options.command = args[0] as 'calculate' | 'fix-zero' | 'recalculate';
    args = args.slice(1); // コマンドを除去
  }

  // オプションの解析
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '-s':
      case '--source':
        if (nextArg) {
          options.source = nextArg;
          i++;
        }
        break;
      case '-b':
      case '--batch':
        if (nextArg && !isNaN(parseInt(nextArg))) {
          options.batch = parseInt(nextArg);
          i++;
        }
        break;
      case '-d':
      case '--dry-run':
        options.dryRun = true;
        break;
      case '-f':
      case '--force':
        options.force = true;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

// ヘルプメッセージを表示
function printHelp() {
  console.error(`
品質スコア管理の統合ツール

使用方法:
  npx tsx scripts/core/manage-quality-scores.ts [コマンド] [オプション]

コマンド:
  calculate   全記事の品質スコアを計算 (デフォルト)
  fix-zero    品質スコアが0の記事を修正
  recalculate 全記事の品質スコアを再計算

共通オプション:
  -s, --source <source>  特定のソースのみ処理
  -h, --help            ヘルプを表示

calculateオプション:
  -b, --batch <size>    バッチサイズ (デフォルト: 100)

fix-zeroオプション:
  -d, --dry-run         実行せずに対象を表示

recalculateオプション:
  -f, --force           強制的に再計算
`);
}

// calculateコマンドの実装（calculate-quality-scores.tsから移植）
async function calculateAllQualityScores(options: Options) {
  console.error('📊 品質スコアの計算を開始します...\n');

  try {
    // 差分処理: 前回処理以降に更新された記事のみを対象
    const processName = 'quality-score-calculation';
    const checkpoint = new Date();
    const lastProcessedAt = await getLastProcessedTime(processName);

    // 記事を取得
    const query: Prisma.ArticleFindManyArgs = {
      include: {
        source: true,
        tags: true,
      },
    };

    // 差分処理のための条件追加
    if (lastProcessedAt && !options.force) {
      query.where = {
        OR: [
          { qualityScore: null },
          { qualityScore: 0 },
          { updatedAt: { gt: lastProcessedAt, lte: checkpoint } }
        ]
      };
    }

    // ソート順を追加
    query.orderBy = { updatedAt: 'asc' };

    if (options.source) {
      query.where = { ...(query.where ?? {}), source: { name: options.source } };
    }

    const articles = await prisma.article.findMany(query);

    console.error(`📄 処理対象の記事数: ${articles.length}件`);
    if (options.source) {
      console.error(`   ソース: ${options.source}`);
    }

    let processedCount = 0;
    const batchSize = options.batch || 100;
    
    // バッチ処理で更新
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (article) => {
          const baseScore = calculateQualityScore(article);
          const { qualityBonus } = checkCategoryQuality(article);
          const finalScore = Math.min(100, baseScore + qualityBonus);
          
          await prisma.article.update({
            where: { id: article.id },
            data: { qualityScore: finalScore },
          });
          
          processedCount++;
        })
      );
      
      console.error(`✓ 処理済み: ${processedCount}/${articles.length}件`);
    }

    // スコア分布を表示
    let scoreDistribution: { range: string; count: bigint }[];
    
    if (options.source) {
      scoreDistribution = await prisma.$queryRaw`
        SELECT 
          CASE 
            WHEN "qualityScore" >= 80 THEN '80-100 (優秀)'
            WHEN "qualityScore" >= 60 THEN '60-79 (良好)'
            WHEN "qualityScore" >= 40 THEN '40-59 (普通)'
            WHEN "qualityScore" >= 20 THEN '20-39 (低)'
            ELSE '0-19 (非常に低い)'
          END as range,
          COUNT(*) as count
        FROM "Article"
        WHERE "sourceId" IN (SELECT id FROM "Source" WHERE name = ${options.source})
        GROUP BY range
        ORDER BY MIN("qualityScore") DESC
      `;
    } else {
      scoreDistribution = await prisma.$queryRaw`
        SELECT 
          CASE 
            WHEN "qualityScore" >= 80 THEN '80-100 (優秀)'
            WHEN "qualityScore" >= 60 THEN '60-79 (良好)'
            WHEN "qualityScore" >= 40 THEN '40-59 (普通)'
            WHEN "qualityScore" >= 20 THEN '20-39 (低)'
            ELSE '0-19 (非常に低い)'
          END as range,
          COUNT(*) as count
        FROM "Article"
        GROUP BY range
        ORDER BY MIN("qualityScore") DESC
      `;
    }

    console.error('\n【品質スコア分布】');
    scoreDistribution.forEach(dist => {
      console.error(`${dist.range}: ${Number(dist.count)}件`);
    });

    // 上位10記事を表示
    const topArticlesQuery: Prisma.ArticleFindManyArgs = {
      take: 10,
      orderBy: { qualityScore: 'desc' },
      include: { source: true },
    };

    if (options.source) {
      topArticlesQuery.where = { source: { name: options.source } };
    }

    const topArticles = await prisma.article.findMany(topArticlesQuery);

    console.error('\n【品質スコア上位10記事】');
    topArticles.forEach((article, index) => {
      console.error(`${index + 1}. [${article.source.name}] ${article.title.substring(0, 50)}... (スコア: ${article.qualityScore})`);
    });

    console.error('\n✅ 品質スコアの計算が完了しました');

    // 処理状態を記録（差分処理用）
    await saveProcessingStatus(
      processName,
      processedCount,
      'success',
      {
        processedCount,
        checkpoint
      },
      checkpoint
    );

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// fix-zeroコマンドの実装（fix-quality-scores.tsから移植）
async function fixZeroScores(options: Options) {
  console.error('📊 品質スコアの修正を開始します...\n');

  try {
    // 品質スコアが0の記事を取得
    const query: Prisma.ArticleFindManyArgs = {
      where: {
        qualityScore: 0
      },
      include: {
        source: true
      }
    };

    if (options.source) {
      query.where.source = { name: options.source };
    }

    const articlesWithoutScore = await prisma.article.findMany(query);

    console.error(`📄 品質スコア0の記事数: ${articlesWithoutScore.length}件`);
    if (options.source) {
      console.error(`   ソース: ${options.source}`);
    }

    if (options.dryRun) {
      console.error('\n【ドライラン - 対象記事一覧】');
      articlesWithoutScore.forEach((article, index) => {
        console.error(`${index + 1}. [${article.source.name}] ${article.title.substring(0, 60)}...`);
      });
      console.error('\n💡 実際に更新する場合は --dry-run オプションを外してください');
      return;
    }

    for (const article of articlesWithoutScore) {
      // シンプルな品質スコア計算
      let score = 50; // 基本スコア

      // ブックマーク数によるスコア
      if (article.bookmarks) {
        if (article.bookmarks >= 100) score += 30;
        else if (article.bookmarks >= 50) score += 25;
        else if (article.bookmarks >= 20) score += 20;
        else if (article.bookmarks >= 10) score += 15;
        else score += 10;
      }

      // 投票数によるスコア
      if (article.userVotes > 0) {
        score += Math.min(article.userVotes * 2, 10);
      }

      // ソースによるボーナス
      const trustedSources = ['はてなブックマーク', 'Qiita Popular', 'AWS'];
      if (trustedSources.includes(article.source.name)) {
        score += 5;
      }

      // 最大100に制限
      const finalScore = Math.min(100, score);

      // 更新
      await prisma.article.update({
        where: { id: article.id },
        data: { qualityScore: finalScore }
      });

      console.error(`✓ ${article.title.slice(0, 50)}... -> スコア: ${finalScore}`);
    }

    console.error('\n✅ 品質スコアの修正が完了しました');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// recalculateコマンドの実装
async function recalculateScores(options: Options) {
  console.error('📊 品質スコアの再計算を開始します...\n');

  if (!options.force) {
    console.error('⚠️  警告: このコマンドはすべての品質スコアをリセットして再計算します。');
    console.error('続行する場合は --force オプションを付けて実行してください。');
    return;
  }

  try {
    // まず、すべての品質スコアをリセット
    console.error('🔄 品質スコアをリセット中...');
    
    if (options.source) {
      const source = await prisma.source.findFirst({
        where: { name: options.source }
      });
      
      if (source) {
        await prisma.article.updateMany({
          where: { sourceId: source.id },
          data: { qualityScore: 0 }
        });
      }
    } else {
      await prisma.article.updateMany({
        data: { qualityScore: 0 }
      });
    }

    console.error('✓ リセット完了\n');

    // その後、通常の計算を実行
    await calculateAllQualityScores(options);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  try {
    switch (options.command) {
      case 'calculate':
        await calculateAllQualityScores(options);
        break;
      case 'fix-zero':
        await fixZeroScores(options);
        break;
      case 'recalculate':
        await recalculateScores(options);
        break;
      default:
        console.error('不明なコマンド:', options.command);
        printHelp();
        process.exit(1);
    }

    process.exit(0);

  } catch (error) {
    console.error('実行エラー:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された場合
if (require.main === module) {
  main();
}

// エクスポート（scheduler-v2.tsから呼び出せるように）
export { calculateAllQualityScores };
