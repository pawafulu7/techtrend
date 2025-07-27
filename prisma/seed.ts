import { PrismaClient, SourceType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.article.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.source.deleteMany();

  // Create sources
  const sources = await Promise.all([
    prisma.source.create({
      data: {
        name: 'はてなブックマーク',
        type: SourceType.RSS,
        url: 'https://b.hatena.ne.jp/hotentry/it.rss',
        enabled: true,
      },
    }),
    prisma.source.create({
      data: {
        name: 'Qiita',
        type: SourceType.API,
        url: 'https://qiita.com/api/v2/items',
        enabled: true,
      },
    }),
    prisma.source.create({
      data: {
        name: 'Zenn',
        type: SourceType.RSS,
        url: 'https://zenn.dev/feed',
        enabled: true,
      },
    }),
    prisma.source.create({
      data: {
        name: 'Dev.to',
        type: SourceType.API,
        url: 'https://dev.to/api/articles',
        enabled: true,
      },
    }),
    prisma.source.create({
      data: {
        name: 'Publickey',
        type: SourceType.RSS,
        url: 'https://www.publickey1.jp/atom.xml',
        enabled: true,
      },
    }),
    prisma.source.create({
      data: {
        name: 'connpass',
        type: SourceType.API,
        url: 'https://connpass.com/api/v1/event/',
        enabled: true,
      },
    }),
    prisma.source.create({
      data: {
        name: 'Stack Overflow Blog',
        type: SourceType.RSS,
        url: 'https://stackoverflow.blog/feed/',
        enabled: true,
      },
    }),
    prisma.source.create({
      data: {
        name: 'InfoQ Japan',
        type: SourceType.RSS,
        url: 'https://www.infoq.com/jp/feed/',
        enabled: true,
      },
    }),
    prisma.source.create({
      data: {
        name: 'Think IT',
        type: SourceType.RSS,
        url: 'https://thinkit.co.jp/rss.xml',
        enabled: true,
      },
    }),
  ]);

  console.log('Seed data created successfully');
  console.log(`Created ${sources.length} sources`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });