import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function restoreSources() {
  console.log('ソースの復旧を開始します...');

  const sourcesToRestore = [
    {
      name: 'はてなブックマーク',
      type: 'RSS',
      url: 'https://b.hatena.ne.jp/hotentry/it.rss',
      enabled: true,
    },
    {
      name: 'Zenn',
      type: 'RSS',
      url: 'https://zenn.dev/feed',
      enabled: true,
    },
    {
      name: 'Dev.to',
      type: 'API',
      url: 'https://dev.to/api/articles',
      enabled: true,
    },
    {
      name: 'Publickey',
      type: 'RSS',
      url: 'https://www.publickey1.jp/atom.xml',
      enabled: true,
    },
    {
      name: 'Stack Overflow Blog',
      type: 'RSS',
      url: 'https://stackoverflow.blog/feed/',
      enabled: true,
    },
    {
      name: 'Think IT',
      type: 'RSS',
      url: 'https://thinkit.co.jp/rss.xml',
      enabled: true,
    },
    {
      name: 'Speaker Deck',
      type: 'SCRAPING',
      url: 'https://speakerdeck.com/',
      enabled: true,
    },
  ];

  for (const sourceData of sourcesToRestore) {
    try {
      const existing = await prisma.source.findUnique({
        where: { name: sourceData.name }
      });

      if (!existing) {
        const source = await prisma.source.create({
          data: sourceData
        });
        console.log(`✅ ${source.name} を追加しました`);
      } else {
        console.log(`⏭️  ${sourceData.name} は既に存在します`);
      }
    } catch (error) {
      console.error(`❌ ${sourceData.name} の追加に失敗:`, error);
    }
  }

  // 現在のソース一覧を表示
  const allSources = await prisma.source.findMany({
    where: { enabled: true },
    orderBy: { name: 'asc' }
  });

  console.log('\n現在の有効なソース:');
  allSources.forEach(source => {
    console.log(`- ${source.name} (${source.type})`);
  });
}

restoreSources()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });