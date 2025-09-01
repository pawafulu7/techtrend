#!/usr/bin/env npx tsx
/**
 * 既存記事にカテゴリを一括適用するスクリプト
 */

import { PrismaClient } from '@prisma/client';
import { CategoryClassifier } from '@/lib/services/category-classifier';

const prisma = new PrismaClient();

async function categorizeArticles() {
  console.log('📂 記事カテゴリ分類を開始します...');

  try {
    // カテゴリが未設定の記事を取得
    const articles = await prisma.article.findMany({
      where: {
        category: null
      },
      include: {
        tags: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`📊 対象記事数: ${articles.length}件`);

    if (articles.length === 0) {
      console.log('✅ すべての記事がカテゴリ分類済みです');
      return;
    }

    // カテゴリ統計
    const categoryStats: Record<string, number> = {};
    let categorizedCount = 0;
    let uncategorizedCount = 0;

    // バッチ処理（100件ずつ）
    const batchSize = 100;
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, Math.min(i + batchSize, articles.length));
      
      console.log(`\n🔄 処理中: ${i + 1}-${Math.min(i + batchSize, articles.length)}件目`);

      // 各記事のカテゴリを判定
      const updates = batch.map(article => {
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

      console.log(`✅ ${batch.length}件を処理しました`);

      // Rate limit対策
      if (i + batchSize < articles.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 結果サマリー
    console.log('\n📊 カテゴリ分類結果:');
    console.log('================================');
    
    const sortedStats = Object.entries(categoryStats)
      .sort((a, b) => b[1] - a[1]);

    for (const [category, count] of sortedStats) {
      const label = CategoryClassifier.getCategoryLabel(category);
      const percentage = ((count / articles.length) * 100).toFixed(1);
      console.log(`${label}: ${count}件 (${percentage}%)`);
    }

    if (uncategorizedCount > 0) {
      const percentage = ((uncategorizedCount / articles.length) * 100).toFixed(1);
      console.log(`未分類: ${uncategorizedCount}件 (${percentage}%)`);
    }

    console.log('================================');
    console.log(`✅ 分類成功: ${categorizedCount}件`);
    console.log(`⚠️  未分類: ${uncategorizedCount}件`);
    console.log('\n✨ カテゴリ分類が完了しました！');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 再分類オプション
async function recategorizeAll() {
  console.log('🔄 全記事の再分類を開始します...');

  try {
    // すべての記事をカテゴリnullにリセット
    await prisma.article.updateMany({
      data: { category: null }
    });

    console.log('✅ カテゴリをリセットしました');

    // 再分類実行
    await categorizeArticles();

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
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