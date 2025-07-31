import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkProblematicSummaries() {
  console.log('=== 要約の問題点を調査中 ===\n');

  // 先頭に句読点がある要約を検索
  const punctuationStart = await prisma.article.findMany({
    where: {
      OR: [
        { summary: { startsWith: '、' } },
        { summary: { startsWith: '。' } },
        { detailedSummary: { startsWith: '、' } },
        { detailedSummary: { startsWith: '。' } }
      ]
    },
    take: 5,
    select: {
      id: true,
      title: true,
      summary: true,
      detailedSummary: true
    }
  });

  console.log('=== 先頭に句読点がある要約 ===');
  console.log(`検出数: ${punctuationStart.length}件`);
  punctuationStart.forEach(article => {
    console.log(`\nID: ${article.id}`);
    console.log(`Title: ${article.title.substring(0, 50)}...`);
    if (article.summary?.startsWith('、') || article.summary?.startsWith('。')) {
      console.log(`Summary: ${article.summary.substring(0, 100)}...`);
    }
    if (article.detailedSummary?.startsWith('、') || article.detailedSummary?.startsWith('。')) {
      console.log(`DetailedSummary: ${article.detailedSummary.substring(0, 100)}...`);
    }
  });

  // プロンプト指示が残っている要約を検索
  const promptPatterns = await prisma.article.findMany({
    where: {
      OR: [
        { summary: { contains: '60-80文字' } },
        { summary: { contains: '簡潔にまとめ' } },
        { detailedSummary: { contains: '300-500文字' } },
        { detailedSummary: { contains: '箇条書き' } }
      ]
    },
    take: 5,
    select: {
      id: true,
      title: true,
      summary: true,
      detailedSummary: true
    }
  });

  console.log('\n\n=== プロンプト指示が残っている要約 ===');
  console.log(`検出数: ${promptPatterns.length}件`);
  promptPatterns.forEach(article => {
    console.log(`\nID: ${article.id}`);
    console.log(`Title: ${article.title.substring(0, 50)}...`);
    if (article.summary?.includes('60-80文字') || article.summary?.includes('簡潔にまとめ')) {
      console.log(`Summary: ${article.summary.substring(0, 150)}...`);
    }
    if (article.detailedSummary?.includes('300-500文字') || article.detailedSummary?.includes('箇条書き')) {
      console.log(`DetailedSummary: ${article.detailedSummary.substring(0, 150)}...`);
    }
  });

  // 文章が途中で切れている可能性がある要約（句点で終わらない）
  const allArticles = await prisma.article.findMany({
    where: {
      OR: [
        { summary: { not: null } },
        { detailedSummary: { not: null } }
      ]
    },
    select: {
      id: true,
      title: true,
      summary: true,
      detailedSummary: true
    }
  });

  const incompleteSentences = allArticles.filter(article => {
    const summaryIncomplete = article.summary && 
      !article.summary.match(/[。！？]$/) && 
      article.summary.trim() !== '';
    const detailedIncomplete = article.detailedSummary && 
      !article.detailedSummary.match(/[。！？]$/) && 
      article.detailedSummary.trim() !== '';
    return summaryIncomplete || detailedIncomplete;
  }).slice(0, 10);

  console.log('\n\n=== 文章が途中で切れている可能性がある要約 ===');
  console.log(`検出数: ${incompleteSentences.length}件（最大10件表示）`);
  incompleteSentences.forEach(article => {
    console.log(`\nID: ${article.id}`);
    console.log(`Title: ${article.title.substring(0, 50)}...`);
    if (article.summary && !article.summary.match(/[。！？]$/)) {
      const lastPart = article.summary.length > 50 
        ? '...' + article.summary.substring(article.summary.length - 50)
        : article.summary;
      console.log(`Summary末尾: ${lastPart}`);
    }
    if (article.detailedSummary && !article.detailedSummary.match(/[。！？]$/)) {
      const lastPart = article.detailedSummary.length > 50 
        ? '...' + article.detailedSummary.substring(article.detailedSummary.length - 50)
        : article.detailedSummary;
      console.log(`DetailedSummary末尾: ${lastPart}`);
    }
  });

  // 統計情報
  const stats = await prisma.article.aggregate({
    _count: {
      summary: true,
      detailedSummary: true
    }
  });

  console.log('\n\n=== 統計情報 ===');
  console.log(`総記事数: ${allArticles.length}件`);
  console.log(`要約あり: ${stats._count.summary}件`);
  console.log(`詳細要約あり: ${stats._count.detailedSummary}件`);

  await prisma.$disconnect();
}

// 直接実行された場合
if (require.main === module) {
  checkProblematicSummaries()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}