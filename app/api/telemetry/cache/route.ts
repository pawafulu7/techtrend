/**
 * Cache Telemetry API
 *
 * Provides cache performance metrics for monitoring and alerting.
 */
import { NextResponse } from 'next/server';
import { cacheMetrics } from '@/lib/monitoring/cache-metrics';

/**
 * GET /api/telemetry/cache
 *
 * Returns comprehensive cache metrics summary
 */
export async function GET(): Promise<NextResponse> {
  const summary = cacheMetrics.getSummary();

  return NextResponse.json(summary, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
