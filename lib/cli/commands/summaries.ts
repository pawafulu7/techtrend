import { Command } from 'commander';
import { logger } from '../utils/logger';
import { getPrismaClient } from '../utils/database';
import { SummaryManager } from '@/lib/services/summary/summary-manager';

// Root command
export const summariesCommand = new Command('summaries').description(
  '記事要約の管理'
);

// generate subcommand
summariesCommand
  .command('generate')
  .description('要約が未生成の記事に対して要約を生成')
  .option('-s, --source <source>', 'ソースを指定')
  .option('-l, --limit <number>', '処理件数の上限', '100')
  .option('-b, --batch-size <number>', 'バッチサイズ', '10')
  .action(async (options) => {
    const prisma = getPrismaClient();

    try {
      logger.info('要約生成を開始します');

      const limit = parseInt(options.limit || '100', 10);
      const batch = parseInt(options.batchSize || '10', 10);

      // Validate parsed integers (CodexMCP指摘)
      if (Number.isNaN(limit) || Number.isNaN(batch)) {
        logger.error('不正なオプション値が指定されました');
        process.exitCode = 1;
        return;
      }

      const manager = new SummaryManager(prisma);
      const result = await manager.generateSummaries({
        source: options.source,
        limit,
        batch,
      });

      if (result.errors > 0) {
        logger.error(`要約生成が完了しました（エラー: ${result.errors}件）`);
        process.exitCode = 1;
      } else {
        logger.success('要約生成が完了しました');
      }
    } catch (error) {
      logger.error('要約生成でエラーが発生しました', error);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  });

summariesCommand
  .command('regenerate')
  .description('既存の要約を再生成')
  .option('-s, --source <source>', 'ソースを指定')
  .option('-d, --days <number>', '対象日数', '7')
  .option('-f, --force', '強制的に再生成')
  .option('-b, --batch <number>', 'バッチサイズ', '10')
  .action(async (options) => {
    const prisma = getPrismaClient();

    try {
      logger.info('要約再生成を開始します');

      const days = parseInt(options.days || '7', 10);
      const batch = parseInt(options.batch || '10', 10);

      // Validate parsed integers
      if (Number.isNaN(days) || Number.isNaN(batch)) {
        logger.error('不正なオプション値が指定されました');
        process.exitCode = 1;
        return;
      }

      const manager = new SummaryManager(prisma);
      const result = await manager.regenerateSummaries({
        source: options.source,
        days,
        force: options.force,
        batch,
      });

      if (result.errors > 0) {
        logger.error(`要約再生成が完了しました（エラー: ${result.errors}件）`);
        process.exitCode = 1;
      } else {
        logger.success('要約再生成が完了しました');
      }
    } catch (error) {
      logger.error('要約再生成でエラーが発生しました', error);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  });

summariesCommand
  .command('check')
  .description('要約の状態をチェック')
  .action(async () => {
    const prisma = getPrismaClient();

    try {
      logger.info('要約状態のチェックを開始します');

      // 全体統計（並列実行で高速化）
      const [totalArticles, withSummary, withoutSummary] = await Promise.all([
        prisma.article.count(),
        prisma.article.count({ where: { summary: { not: null } } }),
        prisma.article.count({ where: { summary: null } }),
      ]);

      logger.info(`全記事数: ${totalArticles.toLocaleString()}`);
      // ゼロ除算対策
      const withSummaryPct =
        totalArticles > 0 ? Math.round((withSummary / totalArticles) * 100) : 0;
      const withoutSummaryPct =
        totalArticles > 0
          ? Math.round((withoutSummary / totalArticles) * 100)
          : 0;
      logger.info(
        `要約あり: ${withSummary.toLocaleString()} (${withSummaryPct}%)`
      );
      logger.info(
        `要約なし: ${withoutSummary.toLocaleString()} (${withoutSummaryPct}%)`
      );

      // ソース別の統計 (N+1解消: groupByで1回のクエリに集約)
      const sourcesWithSummaryCounts = await prisma.article.groupBy({
        by: ['sourceId'],
        where: { summary: { not: null } },
        _count: { _all: true },
      });

      // sourceId→サマリー数のマップを作成
      const summaryCountBySource = Object.fromEntries(
        sourcesWithSummaryCounts.map((row) => [row.sourceId, row._count._all])
      );

      const sources = await prisma.source.findMany({
        select: {
          id: true,
          name: true,
          _count: {
            select: { articles: true },
          },
        },
      });

      logger.info('\nソース別統計:');
      for (const source of sources) {
        const withSummaryCount = summaryCountBySource[source.id] ?? 0;
        const percentage =
          source._count.articles > 0
            ? Math.round((withSummaryCount / source._count.articles) * 100)
            : 0;
        logger.info(
          `  ${source.name}: ${withSummaryCount}/${source._count.articles} (${percentage}%)`
        );
      }

      logger.success('チェックが完了しました');
    } catch (error) {
      logger.error('チェック中にエラーが発生しました', error);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  });
