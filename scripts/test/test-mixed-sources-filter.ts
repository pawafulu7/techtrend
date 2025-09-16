#!/usr/bin/env npx tsx
/**
 * sourcesパラメータの混在処理とcase-insensitive対応のテスト
 */

async function testMixedSourcesFilter() {
  console.log('sourcesパラメータ混在処理のテスト...\n');

  const testCases = [
    {
      name: 'IDのみ指定',
      query: 'sources=cmdq3nww70003tegxm78oydnb',
      expected: 'Dev.toのみ（ID指定）'
    },
    {
      name: '名前のみ指定',
      query: 'sources=Dev.to',
      expected: 'Dev.toのみ（名前指定）'
    },
    {
      name: '複数名前指定',
      query: 'sources=Dev.to,Zenn',
      expected: 'Dev.toとZenn（名前指定）'
    },
    {
      name: 'IDと名前の混在',
      query: 'sources=cmdq3nww70003tegxm78oydnb,Zenn',
      expected: 'Dev.toとZenn（ID+名前混在）'
    },
    {
      name: '大文字小文字混在（case-insensitive）',
      query: 'sources=dev.TO,ZENN',
      expected: 'Dev.toとZenn（大文字小文字無視）'
    },
    {
      name: '存在しないソース名',
      query: 'sources=NonExistentSource',
      expected: '0件（存在しないソース）'
    },
    {
      name: 'IDと存在しない名前の混在',
      query: 'sources=cmdq3nww70003tegxm78oydnb,NonExistentSource',
      expected: 'Dev.toのみ（存在しない名前は無視）'
    }
  ];

  const baseUrl = 'http://localhost:3000/api/articles';

  for (const testCase of testCases) {
    const url = `${baseUrl}?${testCase.query}&limit=5`;
    console.log(`\n=== ${testCase.name} ===`);
    console.log(`URL: ${url}`);
    console.log(`期待結果: ${testCase.expected}`);

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        console.log(`✅ 成功: ${data.data.total}件の記事`);

        // 最初の3件の記事を表示
        if (data.data.items && data.data.items.length > 0) {
          console.log('\n記事例:');
          data.data.items.slice(0, 3).forEach((item: any, idx: number) => {
            console.log(`  ${idx + 1}. [${item.source?.name || 'Unknown'}] ${item.title}`);
          });
        }
      } else {
        console.log(`❌ エラー: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`❌ リクエストエラー:`, error);
    }
  }

  // データベース直接クエリとの比較
  console.log('\n\n=== データベース直接クエリとの比較 ===');

  // Prismaを使った直接クエリ
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    // Dev.toの記事数
    const devtoCount = await prisma.article.count({
      where: {
        source: {
          name: {
            equals: 'Dev.to',
            mode: 'insensitive'
          }
        }
      }
    });
    console.log(`DB直接: Dev.to記事数 = ${devtoCount}件`);

    // Zennの記事数
    const zennCount = await prisma.article.count({
      where: {
        source: {
          name: {
            equals: 'Zenn',
            mode: 'insensitive'
          }
        }
      }
    });
    console.log(`DB直接: Zenn記事数 = ${zennCount}件`);

    // Dev.to + Zennの合計
    const bothCount = await prisma.article.count({
      where: {
        OR: [
          { source: { name: { equals: 'Dev.to', mode: 'insensitive' } } },
          { source: { name: { equals: 'Zenn', mode: 'insensitive' } } },
        ]
      }
    });
    console.log(`DB直接: Dev.to + Zenn = ${bothCount}件`);

  } finally {
    await prisma.$disconnect();
  }

  console.log('\n✅ テスト完了');
}

// 実行
testMixedSourcesFilter().catch(console.error);
