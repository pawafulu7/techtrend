import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupOldThinkIT() {
  console.log('=== Think IT 古い記事のクリーンアップ ===\n');

  // 1年以上前の記事を削除（2024年1月1日より前）
  const cutoffDate = new Date('2024-01-01');
  
  // まず件数を確認
  const oldCount = await prisma.article.count({
    where: {
      source: { name: 'Think IT' },
      publishedAt: { lt: cutoffDate }
    }
  });

  console.log(`削除対象: ${oldCount}件（${cutoffDate.toISOString().split('T')[0]}より前）`);

  if (oldCount > 0) {
    // 削除実行
    const result = await prisma.article.deleteMany({
      where: {
        source: { name: 'Think IT' },
        publishedAt: { lt: cutoffDate }
      }
    });

    console.log(`削除完了: ${result.count}件`);
  }

  // 削除後の統計
  const remaining = await prisma.article.count({
    where: {
      source: { name: 'Think IT' }
    }
  });

  const oldestArticle = await prisma.article.findFirst({
    where: {
      source: { name: 'Think IT' }
    },
    orderBy: { publishedAt: 'asc' },
    select: { title: true, publishedAt: true }
  });

  console.log(`\n=== 削除後の状態 ===`);
  console.log(`Think IT 残り記事数: ${remaining}件`);
  if (oldestArticle) {
    console.log(`最古の記事: [${oldestArticle.publishedAt.toISOString().split('T')[0]}] ${oldestArticle.title}`);
  }

  await prisma.$disconnect();
}

cleanupOldThinkIT().catch(console.error);