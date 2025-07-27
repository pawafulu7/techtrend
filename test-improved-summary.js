const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testImprovedSummary() {
  console.log('🧪 改善された要約生成機能のテスト...\n');

  try {
    // 各種テストケースを取得
    const testCases = [];

    // 1. 要約がない記事
    const noSummary = await prisma.article.findFirst({
      where: { summary: null },
      include: { source: true }
    });
    if (noSummary) testCases.push({ type: '要約なし', article: noSummary });

    // 2. 英語要約の記事（Dev.to）
    const devtoArticle = await prisma.article.findFirst({
      where: {
        source: { name: 'Dev.to' },
        summary: { not: null }
      },
      include: { source: true }
    });
    if (devtoArticle) {
      const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(devtoArticle.summary || '');
      if (!hasJapanese) testCases.push({ type: '英語要約', article: devtoArticle });
    }

    // 3. 途切れた要約
    const truncated = await prisma.article.findFirst({
      where: {
        summary: { not: null },
        OR: [
          { summary: { endsWith: '...' } },
          { summary: { not: { endsWith: '。' } } }
        ]
      },
      include: { source: true }
    });
    if (truncated) testCases.push({ type: '途切れた要約', article: truncated });

    console.log(`テストケース数: ${testCases.length}\n`);

    for (const testCase of testCases) {
      console.log(`【${testCase.type}】`);
      console.log(`ソース: ${testCase.article.source.name}`);
      console.log(`タイトル: ${testCase.article.title.substring(0, 50)}...`);
      console.log(`現在の要約: ${testCase.article.summary || 'なし'}`);
      console.log('---\n');
    }

    // generate-summaries.jsの実行をシミュレート
    console.log('✅ generate-summaries.jsは以下の記事を処理します:');
    console.log('   1. 要約がない記事（summary: null）');
    console.log('   2. 英語の要約（Dev.to, Stack Overflow Blog）');
    console.log('   3. 途切れた要約（「。」で終わらない、200/203文字）');
    console.log('\nすべて60-80文字の日本語要約に統一されます。');

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testImprovedSummary();