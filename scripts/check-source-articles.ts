import { prisma } from '../lib/database';

async function checkSourceArticles() {
  console.log('各ソースの記事数を確認します...\n');

  const sources = await prisma.source.findMany({
    orderBy: { name: 'asc' }
  });

  for (const source of sources) {
    const count = await prisma.article.count({
      where: { sourceId: source.id }
    });

    const latest = await prisma.article.findFirst({
      where: { sourceId: source.id },
      orderBy: { publishedAt: 'desc' },
      select: {
        title: true,
        publishedAt: true
      }
    });

    console.log(`【${source.name}】`);
    console.log(`  記事数: ${count}件`);
    console.log(`  状態: ${source.enabled ? '有効' : '無効'}`);
    if (latest) {
      console.log(`  最新記事: ${latest.title.substring(0, 50)}...`);
      console.log(`  最新記事日時: ${latest.publishedAt.toLocaleString('ja-JP')}`);
    } else {
      console.log(`  最新記事: なし`);
    }
    console.log('');
  }

  const total = await prisma.article.count();
  console.log(`総記事数: ${total}件`);
}

checkSourceArticles()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });