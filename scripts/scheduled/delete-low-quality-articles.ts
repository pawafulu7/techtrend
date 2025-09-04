import { PrismaClient } from '@prisma/client';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';

const prisma = new PrismaClient();

async function deleteLowQualityArticles() {
  console.error('=== 低品質記事の削除 ===\n');

  // Dev.to: 反応数0の記事を削除
  console.error('Dev.toの反応数0の記事を削除中...');
  
  // トランザクション内で処理して外部キー制約エラーを回避
  const devtoDeleted = await prisma.$transaction(async (tx) => {
    // 削除対象の記事IDを取得
    const targetArticles = await tx.article.findMany({
      where: {
        source: { name: 'Dev.to' },
        bookmarks: 0
      },
      select: { id: true }
    });
    
    const articleIds = targetArticles.map(a => a.id);
    
    if (articleIds.length === 0) {
      return { count: 0 };
    }
    
    // ArticleViewを先に削除（外部キー制約を回避）
    const viewsDeleted = await tx.articleView.deleteMany({
      where: { articleId: { in: articleIds } }
    });
    
    console.error(`  関連ArticleView削除: ${viewsDeleted.count}件`);
    
    // その後記事を削除
    const articlesDeleted = await tx.article.deleteMany({
      where: { id: { in: articleIds } }
    });
    
    return articlesDeleted;
  });
  
  console.error(`削除完了: ${devtoDeleted.count}件`);

  // 古い記事を削除（3ヶ月以上前）
  // 2025年8月: 古い記事も価値があるため、自動削除を無効化
  // 検索性能に影響が出た場合に再検討
  /*
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  
  console.error('\n3ヶ月以上前の記事を削除中...');
  const oldDeleted = await prisma.article.deleteMany({
    where: {
      publishedAt: {
        lt: threeMonthsAgo
      }
    }
  });
  console.error(`削除完了: ${oldDeleted.count}件`);
  */
  const oldDeleted = { count: 0 }; // 削除処理をスキップ

  // 削除件数が0より大きい場合はキャッシュを無効化
  const totalDeleted = devtoDeleted.count + oldDeleted.count;
  if (totalDeleted > 0) {
    console.error('\n🔄 キャッシュを無効化中...');
    await cacheInvalidator.onBulkImport();
    console.error('キャッシュ無効化完了');
  }

  // 削除後の統計
  console.error('\n=== 削除後の統計 ===');
  const sources = await prisma.source.findMany({
    where: { enabled: true },
    include: {
      _count: {
        select: { articles: true }
      }
    }
  });

  sources.forEach(source => {
    console.error(`${source.name}: ${source._count.articles}件`);
  });

  await prisma.$disconnect();
}

deleteLowQualityArticles().catch(console.error);