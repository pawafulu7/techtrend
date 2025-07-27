import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteLowQualityArticles() {
  console.log('=== 低品質記事の削除 ===\n');

  // Dev.to: 反応数0の記事を削除
  console.log('Dev.toの反応数0の記事を削除中...');
  const devtoDeleted = await prisma.article.deleteMany({
    where: {
      source: { name: 'Dev.to' },
      bookmarks: 0
    }
  });
  console.log(`削除完了: ${devtoDeleted.count}件`);

  // 古い記事を削除（3ヶ月以上前）
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  
  console.log('\n3ヶ月以上前の記事を削除中...');
  const oldDeleted = await prisma.article.deleteMany({
    where: {
      publishedAt: {
        lt: threeMonthsAgo
      }
    }
  });
  console.log(`削除完了: ${oldDeleted.count}件`);

  // 削除後の統計
  console.log('\n=== 削除後の統計 ===');
  const sources = await prisma.source.findMany({
    where: { enabled: true },
    include: {
      _count: {
        select: { articles: true }
      }
    }
  });

  sources.forEach(source => {
    console.log(`${source.name}: ${source._count.articles}件`);
  });

  await prisma.$disconnect();
}

deleteLowQualityArticles().catch(console.error);