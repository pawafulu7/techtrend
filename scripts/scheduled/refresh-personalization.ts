/**
 * 興味の分野の対応付け・重心・記事の点数を作り直すバッチ
 *
 * 1. タグと分野の対応付けを分野のパターン（lib/personalization/constants.ts）に合わせる（合うのに無い組を足し、
 *    合わなくなった組を消す）
 * 2. 分野の重心を作り直し、全記事の点数（ArticleInterestScore）を書き直す
 * 3. 点数を読む一覧とダイジェストのキャッシュを捨てる
 *
 * 週に 1 回実行する（.github/workflows/scheduler-personalization.yml）。
 * 新しい記事の点数は、埋め込みを作ったとき（lib/rag/article-embedding-pipeline.ts）に書く。
 *
 * 使い方:
 *   npx tsx scripts/scheduled/refresh-personalization.ts
 */
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import { centroidService } from '@/lib/personalization/centroid-service';
import { syncTagCategoryMappings } from '@/lib/personalization/tag-category-mapping';
import { summarizeError } from '@/lib/utils/sanitize-error';

const CACHE_INVALIDATION_TIMEOUT_MS = 30_000;

async function main(): Promise<void> {
  const startTime = Date.now();

  const { created: mappingsCreated, deleted: mappingsDeleted } =
    await syncTagCategoryMappings(prisma);
  const { categories, scoreCount } =
    await centroidService.refreshCentroidsAndScores();

  // 捨てられなくても書き込みは済んでいるので失敗にはしない（一覧は TTL で切れる）
  try {
    // 読み込んだだけで Redis につなぐので、要るときだけ読み込む
    const { cacheInvalidator } = await import('@/lib/cache/cache-invalidator');
    await Promise.race([
      cacheInvalidator.onInterestScoresUpdated(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Cache invalidation timed out')),
          CACHE_INVALIDATION_TIMEOUT_MS
        ).unref()
      ),
    ]);
  } catch (error) {
    logger.warn(
      { errorSummary: summarizeError(error) },
      'Failed to invalidate caches after refreshing interest scores'
    );
  }

  logger.info(
    {
      mappingsCreated,
      mappingsDeleted,
      sampleCounts: Object.fromEntries(
        categories.map((c) => [c.slug, c.sampleCount])
      ),
      scoreCount,
      elapsedMs: Date.now() - startTime,
    },
    'Personalization refresh completed'
  );
}

// Redis の接続が残るとプロセスが終わらないので、終わったら明示的に抜ける（assign-stories.ts と同じ）
main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error(
      { errorSummary: summarizeError(error, { stack: true }) },
      'Personalization refresh failed'
    );
    await prisma.$disconnect();
    process.exit(1);
  });
