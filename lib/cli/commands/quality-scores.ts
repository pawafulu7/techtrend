import { Command } from 'commander';
import { logger } from '../utils/logger';
import { getPrismaClient } from '../utils/database';
import path from 'path';
import { fork } from 'child_process';

export const qualityScoresCommand = new Command('quality-scores')
  .description('品質スコアの管理');

qualityScoresCommand
  .command('calculate')
  .description('品質スコアを計算')
  .option('-s, --source <source>', 'ソースを指定')
  .option('-r, --recalculate', '既存のスコアも再計算')
  .action(async (options) => {
    try {
      logger.info('品質スコア計算を開始します');
      
      const scriptPath = path.join(process.cwd(), 'scripts/core/manage-quality-scores.ts');
      const args = ['calculate'];
      
      if (options.recalculate) {
        args.push('--recalculate');
      }
      if (options.source) {
        args.push('--source', options.source);
      }
      
      const child = fork(scriptPath, args, {
        execArgv: ['-r', 'tsx/cjs'],
        stdio: 'inherit'
      });
      
      child.on('error', (error) => {
        logger.error('品質スコア計算でエラーが発生しました', error);
        process.exit(1);
      });
      
      child.on('exit', (code) => {
        if (code === 0) {
          logger.success('品質スコア計算が完了しました');
        } else {
          logger.error(`品質スコア計算が異常終了しました (code: ${code})`);
          process.exit(code || 1);
        }
      });
      
    } catch (error) {
      logger.error('品質スコア計算でエラーが発生しました', error);
      process.exit(1);
    }
  });

qualityScoresCommand
  .command('fix')
  .description('品質スコアが0の記事を修正')
  .action(async (options) => {
    try {
      logger.info('品質スコア修正を開始します');
      
      const scriptPath = path.join(process.cwd(), 'scripts/core/manage-quality-scores.ts');
      const args = ['fix'];
      
      const child = fork(scriptPath, args, {
        execArgv: ['-r', 'tsx/cjs'],
        stdio: 'inherit'
      });
      
      child.on('error', (error) => {
        logger.error('品質スコア修正でエラーが発生しました', error);
        process.exit(1);
      });
      
      child.on('exit', (code) => {
        if (code === 0) {
          logger.success('品質スコア修正が完了しました');
        } else {
          logger.error(`品質スコア修正が異常終了しました (code: ${code})`);
          process.exit(code || 1);
        }
      });
      
    } catch (error) {
      logger.error('品質スコア修正でエラーが発生しました', error);
      process.exit(1);
    }
  });

qualityScoresCommand
  .command('stats')
  .description('品質スコアの統計情報を表示')
  .action(async () => {
    try {
      logger.info('品質スコア統計を取得します');
      const prisma = getPrismaClient();
      
      // 基本統計
      const stats = await prisma.article.aggregate({
        _avg: { qualityScore: true },
        _min: { qualityScore: true },
        _max: { qualityScore: true },
        _count: true
      });
      
      console.error('\n📊 品質スコア統計:');
      console.error(`  平均スコア: ${stats._avg.qualityScore?.toFixed(1) || '0'}`);
      console.error(`  最小スコア: ${stats._min.qualityScore || 0}`);
      console.error(`  最大スコア: ${stats._max.qualityScore || 0}`);
      console.error(`  記事総数: ${stats._count.toLocaleString()}`);
      
      // スコア分布
      const distribution = await Promise.all([
        prisma.article.count({ where: { qualityScore: { gte: 80 } } }),
        prisma.article.count({ where: { qualityScore: { gte: 60, lt: 80 } } }),
        prisma.article.count({ where: { qualityScore: { gte: 40, lt: 60 } } }),
        prisma.article.count({ where: { qualityScore: { gte: 20, lt: 40 } } }),
        prisma.article.count({ where: { qualityScore: { lt: 20 } } }),
      ]);
      
      console.error('\n📈 スコア分布:');
      console.error(`  80以上: ${distribution[0].toLocaleString()} 記事`);
      console.error(`  60-79: ${distribution[1].toLocaleString()} 記事`);
      console.error(`  40-59: ${distribution[2].toLocaleString()} 記事`);
      console.error(`  20-39: ${distribution[3].toLocaleString()} 記事`);
      console.error(`  20未満: ${distribution[4].toLocaleString()} 記事`);
      
      // ゼロスコアの記事
      const zeroScore = await prisma.article.count({
        where: { qualityScore: 0 }
      });
      
      if (zeroScore > 0) {
        console.error(`\n⚠️  品質スコアが0の記事: ${zeroScore.toLocaleString()} 件`);
      }
      
      logger.success('統計情報の取得が完了しました');
    } catch (error) {
      logger.error('統計情報取得中にエラーが発生しました', error);
      process.exit(1);
    }
  });