/**
 * 技術者向けでない記事を判定するバッチ（issue #722）
 *
 * 直近の記事のうち未判定のものを LLM で判定し、Article.isOffTopic / offTopicCheckedAt を書き込む。
 * 要約の生成の後に実行する（.github/workflows/scheduler-off-topic.yml、
 * ローカルは scripts/scheduled/scheduler.ts）。
 *
 * 使い方:
 *   npx tsx scripts/scheduled/classify-off-topic.ts             # 書き込む
 *   npx tsx scripts/scheduled/classify-off-topic.ts --dry-run   # 書き込まず、全記事の判定を表示する
 *   --days=30          # 判定する期間（日。既定 7）
 *   --limit=2000       # 1回で判定する記事数の上限（既定 500）
 *   --recheck          # 判定済みの記事も判定し直す
 *   --now=2026-09-30T12:00:00Z  # 期間の終わりを指定する（精度の確認用）
 */
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import { getLLMExtractionPipeline } from '@/lib/ai/extraction';
import { classifyOffTopicArticles } from '@/lib/services/off-topic-classifier';

const CACHE_INVALIDATION_TIMEOUT_MS = 30_000;

function readArg(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg?.slice(`--${name}=`.length);
}

function readPositiveInt(name: string): number | undefined {
  const value = readArg(name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid --${name}: ${value}`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const recheck = process.argv.includes('--recheck');
  const nowArg = readArg('now');
  const now = nowArg ? new Date(nowArg) : undefined;
  if (now && Number.isNaN(now.getTime())) {
    throw new Error(`Invalid --now: ${nowArg}`);
  }
  const days = readPositiveInt('days');
  const limit = readPositiveInt('limit');
  const startTime = Date.now();

  const result = await classifyOffTopicArticles(
    prisma,
    getLLMExtractionPipeline(),
    { dryRun, recheck, now, days, limit }
  );

  if (dryRun) {
    for (const a of result.articles) {
      console.error(
        `[${a.isOffTopic ? 'off-topic' : 'keep'}] ${a.sourceName} | ${a.translatedTitle ?? a.title} | ${a.topic} | ${a.evidence}`
      );
    }
  }

  // 一覧のキャッシュは既定で isOffTopic の記事を外すので、変わったら捨てる。
  // 捨てられなくても書き込みは済んでいるので失敗にはしない（キャッシュは 30 分で切れる）
  if (!dryRun && result.changed > 0) {
    try {
      // 読み込んだだけで Redis につなぐので、要るときだけ読み込む
      const { cacheInvalidator } =
        await import('@/lib/cache/cache-invalidator');
      await Promise.race([
        cacheInvalidator.onOffTopicUpdated(),
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
        'Failed to invalidate caches after off-topic classification'
      );
    }
  }

  logger.info(
    {
      candidates: result.candidates,
      classified: result.classified,
      offTopic: result.offTopic,
      changed: result.changed,
      failedBatches: result.failedBatches,
      dryRun,
      elapsedMs: Date.now() - startTime,
    },
    'Off-topic classification completed'
  );

  // すべてのバッチが失敗したときは、API の不調などを知らせるため失敗にする
  if (result.candidates > 0 && result.classified === 0) {
    throw new Error('All off-topic classification batches failed');
  }
}

// Redis の接続が残るとプロセスが終わらないので、終わったら明示的に抜ける（assign-stories.ts と同じ）
main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error({ err: error }, 'Off-topic classification failed');
    await prisma.$disconnect();
    process.exit(1);
  });
