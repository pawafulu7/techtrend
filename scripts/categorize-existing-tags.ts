#!/usr/bin/env tsx
// 既存タグのカテゴリー分類スクリプト

import { PrismaClient } from '@prisma/client';
import { getTagCategory, TAG_CATEGORIES } from '../lib/constants/tag-categories';

const prisma = new PrismaClient();

async function categorizeExistingTags() {
  console.log('既存タグのカテゴリー分類を開始します...\n');

  try {
    // すべてのタグを取得
    const tags = await prisma.tag.findMany({
      orderBy: { name: 'asc' }
    });

    console.log(`総タグ数: ${tags.length}\n`);

    // カテゴリー別の統計
    const stats: Record<string, number> = {
      frontend: 0,
      backend: 0,
      infrastructure: 0,
      database: 0,
      ai_ml: 0,
      devops: 0,
      uncategorized: 0
    };

    // 各タグのカテゴリーを判定して更新
    for (const tag of tags) {
      const category = getTagCategory(tag.name);
      
      if (category) {
        await prisma.tag.update({
          where: { id: tag.id },
          data: { category }
        });
        stats[category]++;
        console.log(`✓ ${tag.name} → ${TAG_CATEGORIES[category].name}`);
      } else {
        stats.uncategorized++;
        console.log(`? ${tag.name} → 未分類`);
      }
    }

    // 統計を表示
    console.log('\n=== カテゴリー分類結果 ===');
    console.log(`フロントエンド: ${stats.frontend}個`);
    console.log(`バックエンド: ${stats.backend}個`);
    console.log(`インフラ: ${stats.infrastructure}個`);
    console.log(`データベース: ${stats.database}個`);
    console.log(`AI/機械学習: ${stats.ai_ml}個`);
    console.log(`DevOps: ${stats.devops}個`);
    console.log(`未分類: ${stats.uncategorized}個`);

    // 未分類タグの一覧を表示
    if (stats.uncategorized > 0) {
      console.log('\n=== 未分類タグ一覧 ===');
      const uncategorizedTags = await prisma.tag.findMany({
        where: { category: null },
        orderBy: { name: 'asc' }
      });
      
      for (const tag of uncategorizedTags) {
        console.log(`- ${tag.name}`);
      }
      
      console.log('\n※ 未分類タグは手動で分類するか、tag-categories.tsに追加してください。');
    }

    console.log('\nカテゴリー分類が完了しました！');
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// スクリプトを実行
categorizeExistingTags();