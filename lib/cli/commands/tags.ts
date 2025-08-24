import { Command } from 'commander';
import { logger } from '../utils/logger';
import { getPrismaClient } from '../utils/database';
import { ProgressBar } from '../utils/progress';
import { categorizeTag } from '@/lib/utils/tag-categorizer';

export const tagsCommand = new Command('tags')
  .description('タグの管理');

tagsCommand
  .command('list')
  .description('タグ一覧を表示')
  .option('-c, --category <category>', 'カテゴリでフィルタ')
  .option('-l, --limit <number>', '表示件数', '50')
  .action(async (options) => {
    try {
      logger.info('タグ一覧を取得します');
      const prisma = getPrismaClient();
      
      const where = options.category ? { category: options.category } : {};
      const limit = parseInt(options.limit) || 50;
      
      const tags = await prisma.tag.findMany({
        where,
        select: {
          name: true,
          category: true,
          _count: {
            select: { articles: true }
          }
        },
        orderBy: {
          articles: {
            _count: 'desc'
          }
        },
        take: limit
      });
      
      console.error('\n🏷️  タグ一覧:');
      console.error('━'.repeat(60));
      console.error('タグ名'.padEnd(30) + 'カテゴリ'.padEnd(20) + '記事数');
      console.error('─'.repeat(60));
      
      for (const tag of tags) {
        console.error(
          tag.name.padEnd(30) +
          (tag.category || '-').padEnd(20) +
          tag._count.articles.toLocaleString()
        );
      }
      
      console.error('━'.repeat(60));
      
      logger.success(`上位${limit}件のタグを表示しました`);
    } catch (error) {
      logger.error('タグ一覧取得中にエラーが発生しました', error);
      process.exit(1);
    }
  });

tagsCommand
  .command('stats')
  .description('タグの統計情報を表示')
  .action(async () => {
    try {
      logger.info('タグ統計を取得します');
      const prisma = getPrismaClient();
      
      // 基本統計
      const totalTags = await prisma.tag.count();
      const tagsWithCategory = await prisma.tag.count({
        where: { category: { not: null } }
      });
      
      // カテゴリ別統計
      const categories = await prisma.tag.groupBy({
        by: ['category'],
        _count: true,
        orderBy: {
          _count: {
            category: 'desc'
          }
        }
      });
      
      console.error('\n📊 タグ統計:');
      console.error(`  総タグ数: ${totalTags.toLocaleString()}`);
      console.error(`  カテゴリ付き: ${tagsWithCategory.toLocaleString()} (${Math.round(tagsWithCategory / totalTags * 100)}%)`);
      console.error(`  カテゴリなし: ${(totalTags - tagsWithCategory).toLocaleString()} (${Math.round((totalTags - tagsWithCategory) / totalTags * 100)}%)`);
      
      console.error('\n📑 カテゴリ別分布:');
      for (const cat of categories) {
        const categoryName = cat.category || '未分類';
        const percentage = Math.round(cat._count / totalTags * 100);
        console.error(`  ${categoryName}: ${cat._count} タグ (${percentage}%)`);
      }
      
      // 人気タグTop10
      const popularTags = await prisma.tag.findMany({
        select: {
          name: true,
          _count: {
            select: { articles: true }
          }
        },
        orderBy: {
          articles: {
            _count: 'desc'
          }
        },
        take: 10
      });
      
      console.error('\n🔥 人気タグ Top10:');
      popularTags.forEach((tag, index) => {
        console.error(`  ${(index + 1).toString().padStart(2)}. ${tag.name} (${tag._count.articles.toLocaleString()} 記事)`);
      });
      
      logger.success('統計情報の取得が完了しました');
    } catch (error) {
      logger.error('統計情報取得中にエラーが発生しました', error);
      process.exit(1);
    }
  });

tagsCommand
  .command('clean')
  .description('空のタグをクリーンアップ')
  .option('--dry-run', '実際には削除せず、対象を表示するのみ')
  .action(async (options) => {
    try {
      const dryRun = options.dryRun || false;
      logger.info(`空のタグの${dryRun ? '確認' : 'クリーンアップ'}を開始します`);
      
      const prisma = getPrismaClient();
      
      // 空のタグを検索
      const emptyTags = await prisma.tag.findMany({
        where: {
          articles: {
            none: {}
          }
        },
        select: {
          id: true,
          name: true
        }
      });
      
      if (emptyTags.length === 0) {
        logger.info('空のタグは見つかりませんでした');
        return;
      }
      
      console.error(`\n🏷️  空のタグが ${emptyTags.length} 件見つかりました:`);
      emptyTags.forEach(tag => console.error(`  - ${tag.name}`));
      
      if (!dryRun) {
        const progress = new ProgressBar(emptyTags.length, '削除中');
        
        for (let i = 0; i < emptyTags.length; i++) {
          await prisma.tag.delete({
            where: { id: emptyTags[i].id }
          });
          progress.update(i + 1);
        }
        
        progress.complete('✅ 削除完了');
        logger.success(`${emptyTags.length} 件の空のタグを削除しました`);
      } else {
        logger.info('--dry-run モードのため、実際の削除は行いませんでした');
      }
      
    } catch (error) {
      logger.error('タグクリーンアップ中にエラーが発生しました', error);
      process.exit(1);
    }
  });

tagsCommand
  .command('categorize')
  .description('タグのカテゴリを自動分類')
  .option('--overwrite', '既存のカテゴリも上書き')
  .option('--dry-run', '実行内容を表示するが更新しない')
  .action(async (options) => {
    try {
      logger.info('タグのカテゴリ分類を開始します');
      
      const prisma = getPrismaClient();
      
      // カテゴリがnullまたは上書きオプションが指定されたタグを取得
      const where = options.overwrite ? {} : { category: null };
      const tags = await prisma.tag.findMany({
        where,
        include: { _count: { select: { articles: true } } }
      });
      
      if (tags.length === 0) {
        logger.info('分類対象のタグがありません');
        return;
      }
      
      logger.info(`${tags.length}件のタグを分類します`);
      
      const progress = new ProgressBar(tags.length);
      let categorizedCount = 0;
      const updates: { id: string; name: string; category: string }[] = [];
      
      for (const tag of tags) {
        const category = categorizeTag(tag.name);
        
        if (category && (options.overwrite || !tag.category)) {
          updates.push({
            id: tag.id,
            name: tag.name,
            category
          });
          categorizedCount++;
          
          if (options.dryRun) {
            logger.debug(`${tag.name} → ${category}`);
          }
        }
        
        progress.increment();
      }
      
      progress.complete(`分類完了: ${categorizedCount}件のタグを分類しました`);
      
      if (options.dryRun) {
        logger.info('ドライラン実行のため、実際の更新は行われませんでした');
        
        // カテゴリ別の集計を表示
        const categorySummary: Record<string, number> = {};
        updates.forEach(update => {
          categorySummary[update.category] = (categorySummary[update.category] || 0) + 1;
        });
        
        logger.info('\nカテゴリ別分類結果:');
        Object.entries(categorySummary).forEach(([category, count]) => {
          logger.info(`  ${category}: ${count}件`);
        });
      } else {
        // バッチ更新
        if (updates.length > 0) {
          logger.info(`データベースを更新中...`);
          
          // トランザクションで一括更新
          await prisma.$transaction(
            updates.map(update => 
              prisma.tag.update({
                where: { id: update.id },
                data: { category: update.category }
              })
            )
          );
          
          logger.success(`${updates.length}件のタグのカテゴリを更新しました`);
        }
      }
      
      // 更新後の統計を表示
      const stats = await prisma.tag.groupBy({
        by: ['category'],
        _count: true,
        orderBy: { _count: { category: 'desc' } }
      });
      
      logger.info('\nカテゴリ別タグ数:');
      stats.forEach(stat => {
        const categoryName = stat.category || 'uncategorized';
        logger.info(`  ${categoryName}: ${stat._count}件`);
      });
      
    } catch (error) {
      logger.error('カテゴリ分類中にエラーが発生しました', error);
      process.exit(1);
    }
  });