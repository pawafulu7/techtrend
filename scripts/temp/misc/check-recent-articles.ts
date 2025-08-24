import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkRecentArticles() {
  const recentArticles = await prisma.article.findMany({
    where: {
      publishedAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24時間以内
      }
    },
    include: {
      source: true
    },
    orderBy: {
      publishedAt: 'desc'
    },
    take: 10
  });

  console.error('最近24時間以内の記事:');
  for (const article of recentArticles) {
    console.error(`\n[${article.source.name}] ${article.title}`);
    console.error(`  公開日: ${article.publishedAt.toLocaleString('ja-JP')}`);
    console.error(`  要約: ${article.summary ? article.summary.substring(0, 50) + '...' : 'なし'}`);
    console.error(`  詳細要約: ${article.detailedSummary ? 'あり' : 'なし'}`);
  }
  
  const noSummaryCount = await prisma.article.count({
    where: {
      publishedAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
      },
      summary: null
    }
  });
  
  console.error(`\n24時間以内の記事で要約がないもの: ${noSummaryCount}件`);
  
  await prisma.$disconnect();
}

checkRecentArticles();