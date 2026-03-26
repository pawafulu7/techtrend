#!/usr/bin/env tsx
/**
 * summaryがあるのにsummaryComputedAtがnullの記事を修正
 */

import { prisma } from '@/lib/prisma';

async function main() {
  console.log('🔧 summaryComputedAtの修正を開始します...');

  try {
    // 対象記事を確認
    const targetArticles = await prisma.article.findMany({
      where: {
        summary: { not: null },
        summaryComputedAt: null
      },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        createdAt: true
      }
    });

    console.log(`📊 修正対象: ${targetArticles.length}件`);

    if (targetArticles.length === 0) {
      console.log('✅ 修正対象の記事はありません');
      return;
    }

    // バッチで更新
    let updateCount = 0;
    const batchSize = 100;

    for (let i = 0; i < targetArticles.length; i += batchSize) {
      const batch = targetArticles.slice(i, i + batchSize);

      await Promise.all(
        batch.map(article =>
          prisma.article.update({
            where: { id: article.id },
            data: {
              summaryComputedAt: article.updatedAt || article.createdAt || new Date()
            }
          })
        )
      );

      updateCount += batch.length;
      console.log(`  更新済み: ${updateCount}/${targetArticles.length}件`);
    }

    console.log('✅ 修正完了！');

    // 確認
    const remaining = await prisma.article.count({
      where: {
        summary: { not: null },
        summaryComputedAt: null
      }
    });

    console.log(`📊 残り未処理: ${remaining}件`);

  } catch (error) {
    console.error('❌ エラー:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);