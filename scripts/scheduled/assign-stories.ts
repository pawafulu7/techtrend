/**
 * 同じ出来事の記事をストーリーにまとめるバッチ（issue #723）
 *
 * 直近7日の記事をまとめ直し、Article.storyId / storySize を書き込む。
 * 埋め込みの生成の後に実行する（.github/workflows/scheduler-embedding-worker.yml）。
 *
 * 使い方:
 *   npx tsx scripts/scheduled/assign-stories.ts            # 書き込む
 *   npx tsx scripts/scheduled/assign-stories.ts --dry-run  # 書き込まず、まとまる記事を表示する
 *   --now=2026-09-30T12:00:00Z                             # 期間の終わりを指定する（精度の確認用）
 */
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import { assignStories } from '@/lib/services/story-clustering';

const CACHE_INVALIDATION_TIMEOUT_MS = 30_000;

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const nowArg = process.argv.find((arg) => arg.startsWith('--now='));
  const now = nowArg ? new Date(nowArg.slice('--now='.length)) : undefined;
  if (now && Number.isNaN(now.getTime())) {
    throw new Error(`Invalid --now: ${nowArg}`);
  }
  const startTime = Date.now();

  const result = await assignStories(prisma, { dryRun, now });

  if (dryRun) {
    for (const { storyId, members } of result.groups) {
      console.error('---');
      for (const m of [...members].sort(
        (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime()
      )) {
        const mark = m.id === storyId ? '*' : ' ';
        console.error(
          `${mark} ${m.publishedAt.toISOString()} ${m.id} ${m.title}`
        );
      }
    }
  }

  // 一覧のキャッシュは storyId・storySize を持つので、変わったら捨てる。
  // 捨てられなくても書き込みは済んでいるので失敗にはしない（キャッシュは 30 分で切れる）
  if (!dryRun && (result.changed > 0 || result.recounted > 0)) {
    try {
      // 読み込んだだけで Redis につなぐので、要るときだけ読み込む。Redis が応答しなくても
      // バッチを止めないよう、待つ時間に上限を付ける
      const { cacheInvalidator } =
        await import('@/lib/cache/cache-invalidator');
      await Promise.race([
        cacheInvalidator.onStoriesUpdated(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Cache invalidation timed out')),
            CACHE_INVALIDATION_TIMEOUT_MS
          ).unref()
        ),
      ]);
    } catch (error) {
      logger.warn(
        { err: error },
        'Failed to invalidate caches after story assignment'
      );
    }
  }

  logger.info(
    {
      candidates: result.candidates,
      pairs: result.pairs,
      stories: result.stories,
      groupedArticles: result.groupedArticles,
      changed: result.changed,
      recounted: result.recounted,
      skipped: result.skipped,
      dryRun,
      elapsedMs: Date.now() - startTime,
    },
    'Story assignment completed'
  );
}

// Redis の接続が残るとプロセスが終わらないので、終わったら明示的に抜ける（generate-tags.ts と同じ）
main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error({ err: error }, 'Story assignment failed');
    await prisma.$disconnect();
    process.exit(1);
  });
