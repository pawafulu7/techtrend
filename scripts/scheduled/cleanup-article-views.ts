/**
 * 閲覧履歴クリーンアップバッチ
 *
 * 機能:
 * 1. 90日以上前の閲覧履歴を削除
 * 2. ユーザーごとに100件上限を超える古い履歴のviewedAtをnullに更新（既読状態は保持）
 *
 * スケジューラ（scheduler.ts）の22時定期クリーンアップから実行
 */
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';

async function cleanupArticleViews(): Promise<void> {
  const startTime = Date.now();

  // 1. 90日以上前の閲覧履歴を削除
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const deleted = await prisma.articleView.deleteMany({
    where: {
      viewedAt: {
        lt: ninetyDaysAgo,
      },
    },
  });

  console.log(`[INFO] Deleted ${deleted.count} article views older than 90 days`);

  // 2. ユーザーごとに100件上限チェック
  // viewedAtがnullでない閲覧履歴が100件を超えるユーザーを取得
  const usersOverLimit = await prisma.$queryRaw<Array<{ userId: string; viewCount: number }>>`
    SELECT "userId", COUNT(*)::int as "viewCount"
    FROM "ArticleView"
    WHERE "viewedAt" IS NOT NULL
    GROUP BY "userId"
    HAVING COUNT(*) > 100
  `;

  let totalCleared = 0;

  for (const { userId } of usersOverLimit) {
    // 最新100件のIDを取得
    const recentViews = await prisma.articleView.findMany({
      where: {
        userId,
        viewedAt: { not: null },
      },
      orderBy: { viewedAt: 'desc' },
      take: 100,
      select: { id: true },
    });

    const recentViewIds = recentViews.map((v) => v.id);

    // 古い履歴のviewedAtをnullに更新（既読状態は保持）
    const result = await prisma.articleView.updateMany({
      where: {
        userId,
        viewedAt: { not: null },
        id: { notIn: recentViewIds },
      },
      data: {
        viewedAt: null,
      },
    });

    totalCleared += result.count;
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(
    `[INFO] Article views cleanup completed in ${duration}s: ` +
      `deleted=${deleted.count}, viewedAt_cleared=${totalCleared}, users_over_limit=${usersOverLimit.length}`
  );
}

// メイン実行
cleanupArticleViews()
  .catch((error) => {
    logger.error({ err: error }, 'Article views cleanup failed');
    console.error(
      '[ERROR] Article views cleanup failed:',
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
