import { prisma } from '../lib/database';

async function checkMissingSummaries() {
  console.log('要約がない記事を確認しています...\n');
  
  // 要約がない記事を取得
  const articlesWithoutSummary = await prisma.article.findMany({
    where: {
      OR: [
        { summary: null },
        { summary: '' }
      ]
    },
    include: {
      source: true
    },
    orderBy: {
      publishedAt: 'desc'
    }
  });
  
  console.log(`要約がない記事数: ${articlesWithoutSummary.length}件\n`);
  
  if (articlesWithoutSummary.length > 0) {
    console.log('要約がない記事一覧:');
    console.log('='.repeat(80));
    
    articlesWithoutSummary.forEach((article, index) => {
      console.log(`${index + 1}. ${article.title}`);
      console.log(`   ソース: ${article.source.name}`);
      console.log(`   URL: ${article.url}`);
      console.log(`   公開日: ${article.publishedAt.toLocaleString('ja-JP')}`);
      console.log('-'.repeat(80));
    });
  }
  
  // ソース別の統計
  const sourceStats = await prisma.article.groupBy({
    by: ['sourceId'],
    where: {
      OR: [
        { summary: null },
        { summary: '' }
      ]
    },
    _count: true
  });
  
  if (sourceStats.length > 0) {
    console.log('\nソース別の要約なし記事数:');
    for (const stat of sourceStats) {
      const source = await prisma.source.findUnique({
        where: { id: stat.sourceId }
      });
      console.log(`- ${source?.name}: ${stat._count}件`);
    }
  }
}

checkMissingSummaries()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });