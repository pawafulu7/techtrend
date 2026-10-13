/**
 * Cache Telemetry API
 *
 * Provides cache performance metrics for monitoring and alerting.
 */
import { NextResponse } from 'next/server';
import { cacheMetrics } from '@/lib/monitoring/cache-metrics';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';

/**
 * GET /api/telemetry/cache
 *
 * Returns comprehensive cache metrics summary
 */
async function getHandler(): Promise<NextResponse> {
  const summary = cacheMetrics.getSummary();

  return NextResponse.json(summary, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

// 内部の監視値なので、管理者だけに見せる（Issue #771。以前は誰でも見られた）
export const GET = withAdminAuth(withRateLimit('admin:read', getHandler));
