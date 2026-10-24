import { EmbeddingWorker } from '@/lib/workers/embedding-worker';
import { logger } from '@/lib/logger';
import { summarizeError } from '@/lib/utils/sanitize-error';

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
