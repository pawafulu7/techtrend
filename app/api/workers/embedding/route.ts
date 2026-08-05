import { NextRequest, NextResponse } from 'next/server';
import { EmbeddingWorker } from '@/lib/workers/embedding-worker';
import { logger } from '@/lib/logger';
import { withEmbeddingWorkerAuth } from './with-embedding-worker-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { env } from '@/lib/config/env';

/**
 * Embedding Worker API Route
 *
 * Processes pending embedding jobs in batches.
 *
 * 注: 現時点でこの HTTP エンドポイントの既知の呼び出し元は存在しない。
 * 定期実行は .github/workflows/scheduler-embedding-worker.yml が
 * scripts/dev/run-embedding-worker.ts を直接実行しており、HTTP を経由しない
 * （vercel.json に crons 定義はない）。
 *
 * Security: Requires CRON_TOKEN/CRON_SECRET Bearer token のみ（admin session は不可）。
 * GET は CSRF 保護対象外のため admin session Cookie を許可しない（withEmbeddingWorkerAuth）。
 * 本番環境では skip_embedding クエリパラメータを無効化し、常に埋め込み生成を実行する。
 */
async function embeddingHandler(request: NextRequest) {
  const skipEmbedding =
    env.NODE_ENV === 'production'
      ? false
      : request.nextUrl.searchParams.get('skip_embedding') === 'true';

  const worker = new EmbeddingWorker({
    batchSize: 300, // Reduced for Vercel 10s timeout
    maxAttempts: 3,
    timeoutMs: 9000, // 9s (leave 1s buffer)
    skipEmbedding,
  });

  logger.info({ skipEmbedding }, 'Embedding worker started');

  const result = await worker.run();

  if (result.status === 'error') {
    logger.error({ result }, 'Embedding worker error');
  } else if (result.status === 'timeout') {
    logger.warn({ result }, 'Embedding worker timeout');
  } else {
    logger.info({ result }, 'Embedding worker completed');
  }

  return NextResponse.json(result, {
    status: result.status === 'error' ? 500 : 200,
  });
}

const rateLimitedEmbeddingHandler = withRateLimit(
  'cron:embedding-worker',
  embeddingHandler
);

export const GET = withEmbeddingWorkerAuth(rateLimitedEmbeddingHandler);
