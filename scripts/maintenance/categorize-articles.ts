#!/usr/bin/env npx tsx
/**
 * 既存記事にカテゴリを一括適用するスクリプト
 */

import { PrismaClient } from '@prisma/client';
import { CategoryClassifier } from '@/lib/services/category-classifier';
import logger from '@/lib/logger';

const prisma = new PrismaClient();

async function categorizeArticles() {
  logger.info('📂 記事カテゴリ分類を開始します...');

  try {
    // まず対象記事の総数を取得
    const totalCount = await prisma.article.count({
      where: {
        category: null
      }
    });

    logger.info(`📊 対象記事数: ${totalCount}件`);

    if (totalCount === 0) {
      logger.info('✅ すべての記事がカテゴリ分類済みです');
      return;
    }

    // カテゴリ統計
    const categoryStats: Record<string, number> = {};
    let categorizedCount = 0;
    let uncategorizedCount = 0;
    let processedCount = 0;

    // ページングで処理（100件ずつ取得して処理）
    const batchSize = 100;
    while (processedCount < totalCount) {
      // カーソルベースのページング
      const articles = await prisma.article.findMany({
        where: {
          category: null
        },
        include: {
          tags: true
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: batchSize,
        skip: processedCount
      });

      if (articles.length === 0) break;
      
      logger.info(`\n🔄 処理中: ${processedCount + 1}-${processedCount + articles.length}件目 / 全${totalCount}件`);

      // 各記事のカテゴリを判定
      const updates = articles.map(article => {
        const category = CategoryClassifier.classify(
          article.tags,
          article.title,
          article.content
        );

        if (category) {
          categoryStats[category] = (categoryStats[category] || 0) + 1;
          categorizedCount++;
        } else {
          uncategorizedCount++;
        }

        return {
          id: article.id,
          category: category
        };
      });

      // 一括更新
      await Promise.all(
        updates.map(update =>
          prisma.article.update({
            where: { id: update.id },
            data: { category: update.category }
          })
        )
      );

      logger.info(`✅ ${articles.length}件を処理しました`);
      processedCount += articles.length;

      // Rate limit対策
      if (processedCount < totalCount) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 結果サマリー
    logger.info('\n📊 カテゴリ分類結果:');
    logger.info('================================');
    
    const sortedStats = Object.entries(categoryStats)
      .sort((a, b) => b[1] - a[1]);

    for (const [category, count] of sortedStats) {
      const label = CategoryClassifier.getCategoryLabel(category);
      const percentage = ((count / totalCount) * 100).toFixed(1);
      logger.info(`${label}: ${count}件 (${percentage}%)`);
    }

    if (uncategorizedCount > 0) {
      const percentage = ((uncategorizedCount / totalCount) * 100).toFixed(1);
      logger.info(`未分類: ${uncategorizedCount}件 (${percentage}%)`);
    }

    logger.info('================================');
    logger.info(`✅ 分類成功: ${categorizedCount}件`);
    logger.warn(`⚠️  未分類: ${uncategorizedCount}件`);
    logger.info('\n✨ カテゴリ分類が完了しました！');

  } catch (error) {
    logger.error('❌ エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 再分類オプション
async function recategorizeAll() {
  logger.info('🔄 全記事の再分類を開始します...');

  try {
    // すべての記事をカテゴリnullにリセット
    await prisma.article.updateMany({
      data: { category: null }
    });

    logger.info('✅ カテゴリをリセットしました');

    // 再分類実行
    await categorizeArticles();

  } catch (error) {
    logger.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// コマンドライン引数処理
const args = process.argv.slice(2);
const forceRecategorize = args.includes('--recategorize') || args.includes('-r');

if (forceRecategorize) {
  recategorizeAll();
} else {
  categorizeArticles();
}