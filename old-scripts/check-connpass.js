const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkConnpass() {
  const source = await prisma.source.findFirst({
    where: { name: 'connpass' }
  });
  
  if (!source) {
    console.log('connpassソースが見つかりません');
    return;
  }
  
  const articles = await prisma.article.count({
    where: { sourceId: source.id }
  });
  
  console.log('connpassソース:', source);
  console.log('connpass記事数:', articles);
  
  // 最新の記事を確認
  const latestArticles = await prisma.article.findMany({
    where: { sourceId: source.id },
    take: 5,
    orderBy: { createdAt: 'desc' }
  });
  
  console.log('\n最新のconnpass記事:');
  latestArticles.forEach(article => {
    console.log('- ', article.title.substring(0, 50) + '...');
  });
}

checkConnpass()
  .catch(console.error)
  .finally(() => prisma.$disconnect());