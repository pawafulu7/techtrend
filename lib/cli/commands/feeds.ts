import { Command } from 'commander';
import { logger } from '../utils/logger';
import { getPrismaClient } from '../utils/database';
import path from 'path';
import { fork } from 'child_process';
import { ValidationError, DatabaseError } from '@/lib/errors';

export const feedsCommand = new Command('feeds')
  .description('フィードの管理');

feedsCommand
  .command('collect')
  .description('指定したソースから記事を収集')
  .argument('[sources...]', 'ソース名（スペース区切りで複数指定可）')
  .option('-a, --all', 'すべてのソースから収集')
  .action(async (sources, options) => {
    try {
      if (!sources.length && !options.all) {
        throw new ValidationError('ソース名を指定するか、--all オプションを使用してください', 'sources');
      }
      
      logger.info('フィード収集を開始します');
      
      const scriptPath = path.join(process.cwd(), 'scripts/collect-feeds.ts');
      const args = options.all ? [] : sources;
      
      const child = fork(scriptPath, args, {
        execArgv: ['-r', 'tsx/cjs'],
        stdio: 'inherit'
      });
      
      child.on('error', (error) => {
        logger.error('フィード収集でエラーが発生しました', error);
        process.exit(1);
      });
      
      child.on('exit', (code) => {
        if (code === 0) {
          logger.success('フィード収集が完了しました');
        } else {
          logger.error(`フィード収集が異常終了しました (code: ${code})`);
          process.exit(code || 1);
        }
      });
      
    } catch (error) {
      if (error instanceof ValidationError) {
        logger.error(error.message);
      } else {
        logger.error('フィード収集でエラーが発生しました', error);
      }
      process.exit(1);
    }
  });

feedsCommand
  .command('sources')
  .description('利用可能なソース一覧を表示')
  .action(async () => {
    try {
      logger.info('ソース一覧を取得します');
      const prisma = getPrismaClient();
      
      const sources = await prisma.source.findMany({
        select: {
          name: true,
          type: true,
          enabled: true,
          _count: {
            select: { articles: true }
          }
        },
        orderBy: { name: 'asc' }
      });
      
      console.log('\n📡 利用可能なソース:');
      console.log('━'.repeat(60));
      console.log('ソース名'.padEnd(25) + 'タイプ'.padEnd(15) + '記事数'.padEnd(10) + '状態');
      console.log('─'.repeat(60));
      
      for (const source of sources) {
        const status = source.enabled ? '✅ 有効' : '❌ 無効';
        console.log(
          source.name.padEnd(25) +
          source.type.padEnd(15) +
          source._count.articles.toLocaleString().padEnd(10) +
          status
        );
      }
      
      console.log('━'.repeat(60));
      console.log(`合計: ${sources.length} ソース`);
      
      logger.success('ソース一覧の取得が完了しました');
    } catch (error) {
      if (error instanceof DatabaseError) {
        logger.error(`データベースエラー: ${error.message}`);
      } else {
        logger.error('ソース一覧取得中にエラーが発生しました', error);
      }
      process.exit(1);
    }
  });

feedsCommand
  .command('stats')
  .description('フィード収集の統計情報を表示')
  .option('-d, --days <number>', '過去n日間の統計', '7')
  .action(async (options) => {
    try {
      const days = parseInt(options.days) || 7;
      logger.info(`過去${days}日間の統計を取得します`);
      
      const prisma = getPrismaClient();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // 期間内の記事数
      const totalArticles = await prisma.article.count({
        where: {
          createdAt: { gte: startDate }
        }
      });
      
      // ソース別の記事数
      const sources = await prisma.source.findMany({
        select: {
          name: true,
          articles: {
            where: {
              createdAt: { gte: startDate }
            },
            select: {
              id: true
            }
          }
        }
      });
      
      console.log(`\n📊 過去${days}日間の収集統計:`);
      console.log(`  総記事数: ${totalArticles.toLocaleString()}`);
      console.log(`  1日平均: ${Math.round(totalArticles / days).toLocaleString()} 記事`);
      
      console.log('\n📑 ソース別収集数:');
      const sourcesWithCount = sources
        .map(s => ({ name: s.name, count: s.articles.length }))
        .filter(s => s.count > 0)
        .sort((a, b) => b.count - a.count);
      
      for (const source of sourcesWithCount) {
        const percentage = Math.round(source.count / totalArticles * 100);
        console.log(`  ${source.name}: ${source.count} 記事 (${percentage}%)`);
      }
      
      logger.success('統計情報の取得が完了しました');
    } catch (error) {
      logger.error('統計情報取得中にエラーが発生しました', error);
      process.exit(1);
    }
  });