import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUnwantedPrefixes() {
  const articles = await prisma.article.findMany({
    where: {
      OR: [
        { summary: { contains: 'タイトルから判断すると' } },
        { summary: { contains: '記事の主題' } },
        { summary: { contains: 'この記事は' } },
        { summary: { contains: '本記事は' } },
        { detailedSummary: { contains: '記事の主題' } },
        { detailedSummary: { contains: 'タイトルから判断すると' } }
      ]
    },
    select: {
      id: true,
      title: true,
      summary: true,
      detailedSummary: true
    },
    take: 10
  });
  
  console.error('不要な前置きを含む要約:', articles.length, '件');
  articles.forEach((article, index) => {
    console.error(`\n--- ${index + 1} ---`);
    console.error('ID:', article.id);
    console.error('タイトル:', article.title);
    console.error('要約:', article.summary);
    if (article.detailedSummary) {
      console.error('詳細要約:', article.detailedSummary.substring(0, 100) + '...');
    }
  });
  
  await prisma.$disconnect();
}

checkUnwantedPrefixes().catch(console.error);