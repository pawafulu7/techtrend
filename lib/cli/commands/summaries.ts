import { Command } from 'commander';
import { logger } from '../utils/logger';
import { getPrismaClient } from '../utils/database';
import path from 'path';
import { fork } from 'child_process';

export const summariesCommand = new Command('summaries')
  .description('記事要約の管理')
  .command('generate')
  .description('要約が未生成の記事に対して要約を生成')
  .option('-s, --source <source>', 'ソースを指定')
  .option('-l, --limit <number>', '処理件数の上限', '100')
  .option('-b, --batch-size <number>', 'バッチサイズ', '10')
  .action(async (options) => {
    try {
      logger.info('要約生成を開始します');
      
      // 既存のスクリプトを子プロセスとして実行
      const scriptPath = path.join(process.cwd(), 'scripts/core/manage-summaries.ts');
      const args = ['generate'];
      
      if (options.source) {
        args.push('--source', options.source);
      }
      
      const child = fork(scriptPath, args, {
        execArgv: ['-r', 'tsx/cjs'],
        stdio: 'inherit'
      });
      
      child.on('error', (error) => {
        logger.error('要約生成でエラーが発生しました', error);
        process.exit(1);
      });
      
      child.on('exit', (code) => {
        if (code === 0) {
          logger.success('要約生成が完了しました');
        } else {
          logger.error(`要約生成が異常終了しました (code: ${code})`);
          process.exit(code || 1);
        }
      });
      
    } catch (_error) {
      logger.error('要約生成でエラーが発生しました', error);
      process.exit(1);
    }
  });

summariesCommand
  .command('regenerate')
  .description('既存の要約を再生成')
  .option('-s, --source <source>', 'ソースを指定')
  .option('-d, --days <number>', '対象日数', '7')
  .action(async (options) => {
    try {
      logger.info('要約再生成を開始します');
      
      const scriptPath = path.join(process.cwd(), 'scripts/core/manage-summaries.ts');
      const args = ['regenerate'];
      
      if (options.source) {
        args.push('--source', options.source);
      }
      if (options.days) {
        args.push('--days', options.days);
      }
      
      const child = fork(scriptPath, args, {
        execArgv: ['-r', 'tsx/cjs'],
        stdio: 'inherit'
      });
      
      child.on('error', (error) => {
        logger.error('要約再生成でエラーが発生しました', error);
        process.exit(1);
      });
      
      child.on('exit', (code) => {
        if (code === 0) {
          logger.success('要約再生成が完了しました');
        } else {
          logger.error(`要約再生成が異常終了しました (code: ${code})`);
          process.exit(code || 1);
        }
      });
      
    } catch (_error) {
      logger.error('要約再生成でエラーが発生しました', error);
      process.exit(1);
    }
  });

summariesCommand
  .command('check')
  .description('要約の状態をチェック')
  .action(async () => {
    try {
      logger.info('要約状態のチェックを開始します');
      const prisma = getPrismaClient();
      
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
        
        source._count.articles > 0
          ? Math.round(withSummaryCount / source._count.articles * 100)
          : 0;
          
      }
      
      logger.success('チェックが完了しました');
    } catch (_error) {
      logger.error('チェック中にエラーが発生しました', _error);
      process.exit(1);
    }
  });