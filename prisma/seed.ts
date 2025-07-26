import { PrismaClient, SourceType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.article.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.source.deleteMany();

  // Create sources
  const hatena = await prisma.source.create({
    data: {
      name: 'はてなブックマーク',
      type: SourceType.RSS,
      url: 'https://b.hatena.ne.jp/category/technology.rss',
      enabled: true,
    },
  });

  const qiita = await prisma.source.create({
    data: {
      name: 'Qiita',
      type: SourceType.API,
      url: 'https://qiita.com/api/v2/items',
      enabled: true,
    },
  });

  const zenn = await prisma.source.create({
    data: {
      name: 'Zenn',
      type: SourceType.RSS,
      url: 'https://zenn.dev/feed',
      enabled: true,
    },
  });

  console.log('Seed data created successfully');
  console.log('Sources:', { hatena, qiita, zenn });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });