const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkArticles() {
  const totalCount = await prisma.article.count();
  console.log('総記事数:', totalCount);
  
  const sources = await prisma.source.findMany({
    where: { enabled: true }
  });
  
  console.log('\n各ソースの記事数:');
  for (const source of sources) {
    const count = await prisma.article.count({
      where: { sourceId: source.id }
    });
    console.log(`- ${source.name}: ${count}記事`);
  }
}

checkArticles()
  .catch(console.error)
  .finally(() => prisma.$disconnect());