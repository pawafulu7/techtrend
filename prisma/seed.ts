import { PrismaClient } from '@prisma/client';

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
        type: 'RSS',
        url: 'https://b.hatena.ne.jp/hotentry/it.rss',
        enabled: true,
      },
    }),
    prisma.source.create({
      data: {
        name: 'Qiita',
        type: 'API',
        url: 'https://qiita.com/api/v2/items',
        enabled: true,
      },
    }),
    prisma.source.create({
      data: {
        name: 'Zenn',
        type: 'RSS',
        url: 'https://zenn.dev/feed',
        enabled: true,
      },
    }),
    prisma.source.create({
      data: {
        name: 'Dev.to',
        type: 'API',
        url: 'https://dev.to/api/articles',
        enabled: true,
      },
    }),
    prisma.source.create({
      data: {
        name: 'Publickey',
        type: 'RSS',
        url: 'https://www.publickey1.jp/atom.xml',
        enabled: true,
      },
    }),
    prisma.source.create({
      data: {
        name: 'connpass',
        type: 'API',
        url: 'https://connpass.com/api/v1/event/',
        enabled: true,
      },
    }),
    prisma.source.create({
      data: {
        name: 'Stack Overflow Blog',
        type: 'RSS',
        url: 'https://stackoverflow.blog/feed/',
        enabled: true,
      },
    }),
    prisma.source.create({
      data: {
        name: 'InfoQ Japan',
        type: 'RSS',
        url: 'https://www.infoq.com/jp/feed/',
        enabled: true,
      },
    }),
    prisma.source.create({
      data: {
        name: 'Think IT',
        type: 'RSS',
        url: 'https://thinkit.co.jp/rss.xml',
        enabled: true,
      },
    }),
    prisma.source.create({
      data: {
        name: 'Speaker Deck',
        type: 'SCRAPING',
        url: 'https://speakerdeck.com',
        enabled: true,
      },
    }),
  ]);

}

main()
  .catch((e) => {
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
