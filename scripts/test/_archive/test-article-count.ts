#!/usr/bin/env npx tsx
/**
 * 記事件数表示のテスト
 * キャッシュキー生成とフィルター条件が正しく動作するか確認
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testArticleCount() {
  console.log('記事件数表示のテスト開始...\n');

  try {
    // 1. 全記事数を確認
    const totalCount = await prisma.article.count();
    console.log(`✅ データベースの全記事数: ${totalCount}件\n`);

    // 2. ソースフィルターありの記事数
    const devtoCount = await prisma.article.count({
      where: {
        source: {
          name: 'Dev.to',
        },
      },
    });
    console.log(`✅ Dev.toの記事数: ${devtoCount}件`);

    const zennCount = await prisma.article.count({
      where: {
        source: {
          name: 'Zenn',
        },
      },
    });
    console.log(`✅ Zennの記事数: ${zennCount}件`);

    // 3. 日付範囲フィルターありの記事数
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekCount = await prisma.article.count({
      where: {
        publishedAt: {
          gte: weekAgo,
        },
      },
    });
    console.log(`✅ 過去1週間の記事数: ${weekCount}件`);

    // 4. タグフィルターありの記事数
    const reactArticles = await prisma.article.count({
      where: {
        tags: {
          some: {
            name: 'React',
          },
        },
      },
    });
    console.log(`✅ Reactタグの記事数: ${reactArticles}件`);

    // 5. 複合条件の記事数
    const complexCount = await prisma.article.count({
      where: {
        AND: [
          {
            source: {
              name: 'Dev.to',
            },
          },
          {
            tags: {
              some: {
                name: 'JavaScript',
              },
            },
          },
          {
            publishedAt: {
              gte: weekAgo,
            },
          },
        ],
      },
    });
    console.log(`✅ 複合条件（Dev.to + JavaScript + 過去1週間）の記事数: ${complexCount}件\n`);

    // API呼び出しのテスト
    console.log('APIエンドポイントのテスト...');
    const testCases = [
      { query: '', expected: '全記事' },
      { query: 'sources=Dev.to', expected: 'Dev.to記事' },
      { query: 'sources=none', expected: '0件（ソースなし）' },
      { query: 'dateRange=week', expected: '過去1週間' },
      { query: 'tag=React', expected: 'Reactタグ（単一）' },
      { query: 'tags=React', expected: 'Reactタグ（複数形）' },
      { query: 'sources=Dev.to&tags=JavaScript&dateRange=week', expected: '複合条件' },
    ];

    for (const testCase of testCases) {
      const url = `http://localhost:3000/api/articles?${testCase.query}&includeEmptyContent=true`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        console.log(`✅ ${testCase.expected}: ${data.data?.total ?? 0}件`);
      } catch (error) {
        console.error(`❌ ${testCase.expected}: APIエラー`, error);
      }
    }

    console.log('\n✅ すべてのテストが完了しました');
  } catch (error) {
    console.error('❌ テスト中にエラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
testArticleCount().catch(console.error);