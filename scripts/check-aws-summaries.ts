import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAWSSummaries() {
  const awsArticles = await prisma.article.findMany({
    where: {
      source: { name: 'AWS' }
    },
    select: {
      id: true,
      title: true,
      summary: true
    }
  });

  const withoutSummary = awsArticles.filter(a => !a.summary);
  console.log(`AWS記事総数: ${awsArticles.length}`);
  console.log(`要約なし: ${withoutSummary.length}`);
  
  if (withoutSummary.length > 0) {
    console.log('\n要約がない記事の例:');
    withoutSummary.slice(0, 5).forEach(a => {
      console.log(`  - ${a.title}`);
    });
  }
}

checkAWSSummaries().catch(console.error).finally(() => prisma.$disconnect());