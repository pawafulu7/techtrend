import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSources() {
  const sources = await prisma.source.findMany({
    where: { enabled: true },
    include: {
      _count: {
        select: { articles: true }
      }
    },
    orderBy: { name: 'asc' }
  });

  const filtered = sources.filter(s => s._count.articles > 0);
  console.log('表示されるソース:');
  filtered.forEach(s => {
    console.log(`- ${s.name}: ${s._count.articles}件`);
  });

  console.log('\n記事がないソース:');
  sources.filter(s => s._count.articles === 0).forEach(s => {
    console.log(`- ${s.name}`);
  });

  await prisma.$disconnect();
}

checkSources();