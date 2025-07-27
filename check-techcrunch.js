const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTechCrunch() {
  const source = await prisma.source.findFirst({
    where: { name: 'TechCrunch Japan' }
  });
  
  console.log('TechCrunch Japanソース:', source);
  
  if (source) {
    const count = await prisma.article.count({
      where: { sourceId: source.id }
    });
    console.log('TechCrunch Japan記事数:', count);
    
    const articles = await prisma.article.findMany({
      where: { sourceId: source.id },
      take: 5,
      orderBy: { publishedAt: 'desc' }
    });
    
    console.log('\n最新の記事:');
    articles.forEach(a => console.log('- ', a.title));
  }
  
  // すべてのソースを確認
  const allSources = await prisma.source.findMany();
  console.log('\n全ソース:');
  for (const s of allSources) {
    const count = await prisma.article.count({
      where: { sourceId: s.id }
    });
    console.log(`- ${s.name}: ${count}記事`);
  }
}

checkTechCrunch()
  .catch(console.error)
  .finally(() => prisma.$disconnect());