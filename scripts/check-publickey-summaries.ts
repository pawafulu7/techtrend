import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPublickeySummaries() {
  const articles = await prisma.article.findMany({
    where: {
      source: { name: 'Publickey' }
    },
    select: {
      id: true,
      title: true,
      summary: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  console.log(`Publickey記事（最新10件）:`);
  console.log(`総数: ${articles.length}件`);
  
  let withoutSummaryCount = 0;
  
  articles.forEach(a => {
    console.log(`\nタイトル: ${a.title.substring(0, 50)}...`);
    console.log(`要約: ${a.summary ? a.summary.substring(0, 100) + '...' : '❌ 要約なし'}`);
    console.log(`作成日時: ${a.createdAt.toLocaleString('ja-JP')}`);
    
    if (!a.summary) withoutSummaryCount++;
  });
  
  console.log(`\n要約なし: ${withoutSummaryCount}/${articles.length}件`);
}

checkPublickeySummaries().catch(console.error).finally(() => prisma.$disconnect());