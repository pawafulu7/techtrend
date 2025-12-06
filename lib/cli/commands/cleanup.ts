import { Command } from 'commander';
import { logger } from '../utils/logger';
import { getPrismaClient } from '../utils/database';
import path from 'path';
import { fork } from 'child_process';

// Note: path and fork are used by the tags command

export const cleanupCommand = new Command('cleanup')
  .description('データのクリーンアップ');

cleanupCommand
  .command('tags')
  .description('空のタグや重複タグをクリーンアップ')
  .option('--dry-run', '実際には削除せず、対象を表示するのみ')
  .action(async (options) => {
    try {
      const dryRun = options.dryRun || false;
      logger.info(`タグの${dryRun ? '確認' : 'クリーンアップ'}を開始します`);
      
      const scriptPath = path.join(process.cwd(), 'scripts/scheduled/clean-tags.ts');
      const args = [];
      
      const child = fork(scriptPath, args, {
        execArgv: ['-r', 'tsx/cjs'],
        stdio: 'inherit'
      });
      
      child.on('error', (error) => {
        logger.error('タグクリーンアップでエラーが発生しました', error);
        process.exit(1);
      });
      
      child.on('exit', (code) => {
        if (code === 0) {
          logger.success('タグクリーンアップが完了しました');
        } else {
          logger.error(`タグクリーンアップが異常終了しました (code: ${code})`);
          process.exit(code || 1);
        }
      });
      
    } catch (_error) {
      logger.error('タグクリーンアップでエラーが発生しました', _error);
      process.exit(1);
    }
  });

cleanupCommand
  .command('stats')
  .description('クリーンアップ対象の統計情報を表示')
  .action(async () => {
    try {
      logger.info('クリーンアップ対象の統計を取得します');
      const prisma = getPrismaClient();
      
      // 低品質記事の統計
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      await prisma.article.count({
        where: {
          qualityScore: { lt: 30 },
          publishedAt: { lt: thirtyDaysAgo }
        }
      });
      
      await prisma.article.count({
        where: {
          qualityScore: { lt: 30 },
          publishedAt: { lt: ninetyDaysAgo }
        }
      });
      
      
      // 空のタグ
      const emptyTags = await prisma.tag.findMany({
        where: {
          articles: {
            none: {}
          }
        },
        select: {
          name: true
        }
      });
      
      if (emptyTags.length > 0 && emptyTags.length <= 10) {
      }
      
      // 重複記事の可能性
      await prisma.article.groupBy({
        by: ['url'],
        _count: true,
        having: {
          url: {
            _count: {
              gt: 1
            }
          }
        }
      });
      
      
      logger.success('統計情報の取得が完了しました');
    } catch (_error) {
      logger.error('統計情報取得中にエラーが発生しました', _error);
      process.exit(1);
    }
  });
