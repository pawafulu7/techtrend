/**
 * 閲覧履歴クリーンアップバッチ
 *
 * 機能:
 * 1. 90日以上前の閲覧履歴を削除
 * 2. ユーザーごとに100件上限を超える古い履歴を削除
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

  console.error(`[INFO] Deleted ${deleted.count} article views older than 90 days`);

  // 2. ユーザーごとに100件上限チェック
  // viewedAtがnullでない閲覧履歴が100件を超えるユーザーを取得
  const usersOverLimit = await prisma.$queryRaw<Array<{ userId: string }>>`
    SELECT "userId"
    FROM "ArticleView"
    WHERE "viewedAt" IS NOT NULL
    GROUP BY "userId"
    HAVING COUNT(*) > 100
  `;

  let totalDeleted = 0;

  for (const { userId } of usersOverLimit) {
    try {
      await prisma.$transaction(async (tx) => {
        // 最新100件のIDとcutoffを取得
        const recentViews = await tx.articleView.findMany({
          where: {
            userId,
            viewedAt: { not: null },
          },
          orderBy: [{ viewedAt: 'desc' }, { id: 'desc' }],
          take: 100,
          select: { id: true, viewedAt: true },
        });

        const cutoff = recentViews.at(-1)?.viewedAt;
        if (!cutoff) {
          return; // 100件以下ならスキップ（HAVINGで100超のはずだが安全策）
        }

        const recentViewIds = recentViews.map((v) => v.id);

        // cutoff以前の古い履歴をトランザクションで削除
        const result = await tx.articleView.deleteMany({
          where: {
            userId,
            OR: [
              { viewedAt: { lt: cutoff } },
              {
                viewedAt: cutoff,
                id: { notIn: recentViewIds },
              },
            ],
          },
        });

        totalDeleted += result.count;
      });
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to cleanup views for user');
    }
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  console.error(
    `[INFO] Article views cleanup completed in ${duration}s: ` +
      `deleted=${deleted.count}, excess_deleted=${totalDeleted}, users_over_limit=${usersOverLimit.length}`
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
