/**
 * Batch Telemetry API
 *
 * Provides batch job execution metrics for monitoring.
 */
import { NextResponse } from 'next/server';
import { batchMetrics } from '@/lib/monitoring/batch-metrics';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';

/**
 * GET /api/telemetry/batch
 *
 * Returns batch job metrics summary
 */
async function getHandler(): Promise<NextResponse> {
  const summary = batchMetrics.getSummary();

  return NextResponse.json(summary, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

// 内部の監視値なので、管理者だけに見せる（Issue #771。以前は誰でも見られた）
export const GET = withAdminAuth(withRateLimit('admin:read', getHandler));
