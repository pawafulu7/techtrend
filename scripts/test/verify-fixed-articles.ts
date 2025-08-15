#!/usr/bin/env node

/**
 * 修正済み記事の検証スクリプト
 * 47件の問題記事が正しく修正されたことを確認
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyFixedArticles() {
  console.log('========================================');
  console.log(' 修正済み記事の検証');
  console.log('========================================\n');

  // 1. createdAt < publishedAtの記事が存在しないことを確認
  const problematicArticles = await prisma.article.findMany({
    where: {},
    select: {
      id: true,
      title: true,
      createdAt: true,
      publishedAt: true,
      source: {
        select: {
          name: true
        }
      }
    }
  });

  const stillProblematic = problematicArticles.filter(article => 
    article.createdAt < article.publishedAt
  );

  console.log('[検証1] 論理的矛盾の確認');
  console.log(`総記事数: ${problematicArticles.length}件`);
  console.log(`問題記事数: ${stillProblematic.length}件`);
  console.log(`結果: ${stillProblematic.length === 0 ? '✅ 合格（問題記事なし）' : '❌ 失敗'}\n`);

  if (stillProblematic.length > 0) {
    console.log('残存する問題記事:');
    stillProblematic.slice(0, 5).forEach(article => {
      console.log(`  - ${article.source.name}: ${article.title.substring(0, 40)}...`);
      console.log(`    createdAt: ${article.createdAt.toISOString()}`);
      console.log(`    publishedAt: ${article.publishedAt.toISOString()}`);
    });
    console.log();
  }

  // 2. 特定ソースの記事をサンプリング
  const targetSources = ['Google Developers Blog', 'Stack Overflow Blog', 'AWS', 'Publickey'];
  
  console.log('[検証2] 修正対象ソースの確認');
  for (const sourceName of targetSources) {
    const sourceArticles = await prisma.article.findMany({
      where: {
        source: {
          name: sourceName
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 3,
      select: {
        title: true,
        createdAt: true,
        publishedAt: true
      }
    });

    if (sourceArticles.length > 0) {
      console.log(`\n${sourceName}:`);
      sourceArticles.forEach(article => {
        const isValid = article.createdAt >= article.publishedAt;
        console.log(`  ${isValid ? '✅' : '❌'} ${article.title.substring(0, 40)}...`);
        console.log(`     published: ${article.publishedAt.toISOString()}`);
        console.log(`     created:   ${article.createdAt.toISOString()}`);
      });
    }
  }

  // 3. 統計情報
  console.log('\n[検証3] 統計情報');
  const sourceStats = await prisma.article.groupBy({
    by: ['sourceId'],
    _count: {
      id: true
    }
  });

  const sources = await prisma.source.findMany();
  const sourceMap = Object.fromEntries(sources.map(s => [s.id, s.name]));

  for (const stat of sourceStats) {
    const sourceName = sourceMap[stat.sourceId];
    if (targetSources.includes(sourceName)) {
      console.log(`${sourceName}: ${stat._count.id}件`);
    }
  }

  console.log('\n========================================');
  console.log(' 検証完了');
  console.log('========================================');
  
  await prisma.$disconnect();
}

// 実行
verifyFixedArticles().catch(async (error) => {
  console.error('エラーが発生しました:', error);
  await prisma.$disconnect();
  process.exit(1);
});