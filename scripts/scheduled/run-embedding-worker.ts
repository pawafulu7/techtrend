import { EmbeddingWorker } from '@/lib/workers/embedding-worker';
import { logger } from '@/lib/logger';
import { summarizeError } from '@/lib/utils/sanitize-error';

const CACHE_INVALIDATION_TIMEOUT_MS = 30_000;

/**
 * Embedding worker entry point.
 *
 * In production, GitHub Actions runs this every 30 minutes
 * (.github/workflows/scheduler-embedding-worker.yml).
 * In local dev, run it manually.
 *
 * Usage:
 *   npm run worker:embedding
 *   npm run worker:embedding:dry  # Skip actual embedding generation (testing only)
 */

async function runWorker() {
  const skipEmbedding = process.argv.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('Embedding Worker - Manual Execution (Local Dev)');
  console.log('='.repeat(60));
  console.log();

  if (skipEmbedding) {
    console.log('⚠️  DRY RUN MODE: Embeddings will NOT be generated');
    console.log();
  }

  const worker = new EmbeddingWorker({ skipEmbedding });

  try {
    const result = await worker.run();

    console.log();
    console.log('='.repeat(60));
    console.log('Worker Execution Result');
    console.log('='.repeat(60));
    console.log(`Status: ${result.status}`);
    console.log(`Processed: ${result.processed}`);

    if (result.status === 'completed' || result.status === 'timeout') {
      console.log(`Succeeded: ${result.succeeded}`);
      console.log(`Failed: ${result.failed}`);
      console.log(`Timed Out: ${result.timedOut}`);
      console.log(`Duration: ${result.durationMs}ms`);
    } else if (result.status === 'idle') {
      console.log(`Message: ${result.message}`);
    } else if (result.status === 'error') {
      console.log(`Duration: ${result.durationMs}ms`);
    }

    if (result.error) {
      console.log();
      // result.error はワーカーの catch した例外の message（接続先が入りうる）なので中身は出さない
      console.log('Error: worker run failed');
    }

    console.log('='.repeat(60));
    console.log();

    // Log summary
    logger.info(
      {
        status: result.status,
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
        hasError: Boolean(result.error),
      },
      'Worker execution completed'
    );

    // 要約の埋め込みを書いた記事には興味の分野の点数も書いたので、点数を読む一覧とダイジェストの
    // キャッシュを捨てる（捨てないと、分野で絞った一覧に新しい記事が TTL の 1 時間ほど出ない）。
    // 捨てられなくても書き込みは済んでいるので失敗にはしない
    if (!skipEmbedding && (result.succeeded ?? 0) > 0) {
      try {
        // 読み込んだだけで Redis につなぐので、要るときだけ読み込む（assign-stories.ts と同じ）
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
          'Failed to invalidate caches after embedding'
        );
      }
    }
  } catch (error) {
    console.error();
    console.error('Worker execution failed:', summarizeError(error, { stack: true }));
    logger.error({ errorSummary: summarizeError(error) }, 'Worker execution failed');
    process.exit(1);
  }
}

runWorker()
  .then(() => {
    console.log('Worker execution completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Worker execution failed:', summarizeError(error, { stack: true }));
    process.exit(1);
  });
