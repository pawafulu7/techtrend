import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkDetailedSummaries() {
  const articles = await prisma.article.findMany({
    where: {
      detailedSummary: { not: null }
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  console.error('最新10件の詳細要約をチェック:');
  console.error('=====================================');
  
  for (const article of articles) {
    const lines = article.detailedSummary?.split('\n').filter((l: string) => l.trim()) || [];
    const hasBulletPoints = lines.some((line: string) => line.startsWith('・'));
    const lineCount = lines.length;
    
    console.error('\n[' + article.source + '] ' + article.title.substring(0, 50) + '...');
    console.error('  箇条書き形式: ' + (hasBulletPoints ? '✅' : '❌'));
    console.error('  行数: ' + lineCount);
    
    if (!hasBulletPoints) {
      console.error('  詳細要約（最初の200文字）:');
      console.error('  ' + article.detailedSummary?.substring(0, 200));
    }
  }
  
  await prisma.$disconnect();
}

checkDetailedSummaries();