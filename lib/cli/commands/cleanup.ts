import { Command } from 'commander';
import { logger } from '../utils/logger';
import { getPrismaClient } from '../utils/database';
import path from 'path';
import { fork } from 'child_process';

export const cleanupCommand = new Command('cleanup')
  .description('データのクリーンアップ');

cleanupCommand
  .command('articles')
  .description('低品質記事を削除')
  .option('-d, --days <number>', '対象日数（この日数より古い記事）', '90')
  .option('-s, --score <number>', '品質スコアの閾値', '30')
  .option('--dry-run', '実際には削除せず、対象を表示するのみ')
  .action(async (options) => {
    try {
      const dryRun = options.dryRun || false;
      logger.info(`低品質記事の${dryRun ? '確認' : '削除'}を開始します`);
      
      const scriptPath = path.join(process.cwd(), 'scripts/scheduled/delete-low-quality-articles.ts');
      const args = [];
      
      // 既存スクリプトはオプションを受け付けないため、直接実行
      const child = fork(scriptPath, args, {
        execArgv: ['-r', 'tsx/cjs'],
        stdio: 'inherit'
      });
      
      child.on('error', (error) => {
        logger.error('記事削除でエラーが発生しました', error);
        process.exit(1);
      });
      
      child.on('exit', (code) => {
        if (code === 0) {
          logger.success('記事削除が完了しました');
        } else {
          logger.error(`記事削除が異常終了しました (code: ${code})`);
          process.exit(code || 1);
        }
      });
      
    } catch (error) {
      logger.error('記事削除でエラーが発生しました', error);
      process.exit(1);
    }
  });

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
      
    } catch (error) {
      logger.error('タグクリーンアップでエラーが発生しました', error);
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
      
      const lowQuality30Days = await prisma.article.count({
        where: {
          qualityScore: { lt: 30 },
          publishedAt: { lt: thirtyDaysAgo }
        }
      });
      
      const lowQuality90Days = await prisma.article.count({
        where: {
          qualityScore: { lt: 30 },
          publishedAt: { lt: ninetyDaysAgo }
        }
      });
      
      console.error('\n🗑️  削除候補記事:');
      console.error(`  30日以上前の低品質記事: ${lowQuality30Days.toLocaleString()} 件`);
      console.error(`  90日以上前の低品質記事: ${lowQuality90Days.toLocaleString()} 件`);
      
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
      
      console.error(`\n🏷️  空のタグ: ${emptyTags.length} 件`);
      if (emptyTags.length > 0 && emptyTags.length <= 10) {
        emptyTags.forEach(tag => console.error(`    - ${tag.name}`));
      }
      
      // 重複記事の可能性
      const duplicateUrls = await prisma.article.groupBy({
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
      
      console.error(`\n🔄 重複URL: ${duplicateUrls.length} 件`);
      
      logger.success('統計情報の取得が完了しました');
    } catch (error) {
      logger.error('統計情報取得中にエラーが発生しました', error);
      process.exit(1);
    }
  });