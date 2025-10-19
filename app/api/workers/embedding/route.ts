import { NextRequest, NextResponse } from 'next/server';
import { EmbeddingWorker } from '@/lib/workers/embedding-worker';
import { logger } from '@/lib/logger';

/**
 * Embedding Worker API Route
 *
 * Triggered by Vercel Cron every 5 minutes.
 * Processes pending embedding jobs in batches.
 *
 * Security: Requires x-vercel-cron header (set by Vercel Cron only)
 */
export async function GET(request: NextRequest) {
  // Security: Verify Vercel Cron header
  const cronHeader = request.headers.get('x-vercel-cron');
  if (cronHeader !== '1') {
    logger.warn({ headers: Object.fromEntries(request.headers) }, 'Unauthorized worker request');

    return NextResponse.json({ error: 'Unauthorized: Not a valid cron request' }, { status: 401 });
  }

  // Get skip flag from query params (for local testing)
  const skipEmbedding = request.nextUrl.searchParams.get('skip_embedding') === 'true';

  // Create worker
  const worker = new EmbeddingWorker({
    batchSize: 300, // Reduced for Vercel 10s timeout
    maxAttempts: 3,
    timeoutMs: 9000, // 9s (leave 1s buffer)
    skipEmbedding,
  });

  // Log worker start
  logger.info({ skipEmbedding }, 'Embedding worker started');

  // Run worker
  const result = await worker.run();

  // Log result
  if (result.status === 'error') {
    logger.error({ result }, 'Embedding worker error');
  } else if (result.status === 'timeout') {
    logger.warn({ result }, 'Embedding worker timeout');
  } else {
    logger.info({ result }, 'Embedding worker completed');
  }

  // Return result
  return NextResponse.json(result, {
    status: result.status === 'error' ? 500 : 200,
  });
}
