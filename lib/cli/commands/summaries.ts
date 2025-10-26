import { Command } from 'commander';
import { logger } from '../utils/logger';
import { getPrismaClient } from '../utils/database';
import { SummaryManager } from '@/lib/services/summary-manager';

export const summariesCommand = new Command('summaries')
  .description('記事要約の管理')
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
        command: 'generate',
        source: options.source,
        limit,
        batch
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
        command: 'regenerate',
        source: options.source,
        days,
        force: options.force,
        batch
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

      await prisma.article.count();
      await prisma.article.count({
        where: { summary: { not: null } }
      });
      await prisma.article.count({
        where: { summary: null }
      });


      // ソース別の統計
      const sources = await prisma.source.findMany({
        select: {
          name: true,
          _count: {
            select: { articles: true }
          }
        }
      });

      for (const source of sources) {
        const withSummaryCount = await prisma.article.count({
          where: {
            sourceId: source.name,
            summary: { not: null }
          }
        });

        const _percentage = source._count.articles > 0
          ? Math.round(withSummaryCount / source._count.articles * 100)
          : 0;

      }

      logger.success('チェックが完了しました');
    } catch (error) {
      logger.error('チェック中にエラーが発生しました', error);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  });
