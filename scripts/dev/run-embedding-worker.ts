import { EmbeddingWorker } from '@/lib/workers/embedding-worker';
import { logger } from '@/lib/logger';

/**
 * Manual worker execution for local development.
 *
 * In production, this runs automatically via Vercel Cron (/api/workers/embedding).
 * In local dev, Vercel Cron doesn't work, so use this script instead.
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
      console.log('Error:', result.error);
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
        error: result.error,
      },
      'Worker execution completed'
    );

  } catch (error) {
    console.error();
    console.error('Worker execution failed:', error);
    logger.error({ error }, 'Worker execution failed');
    process.exit(1);
  }
}

runWorker()
  .then(() => {
    console.log('Worker execution completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Worker execution failed:', error);
    process.exit(1);
  });
