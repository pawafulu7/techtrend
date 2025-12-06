/**
 * Batch Telemetry API
 *
 * Provides batch job execution metrics for monitoring.
 */
import { NextResponse } from 'next/server';
import { batchMetrics } from '@/lib/monitoring/batch-metrics';

/**
 * GET /api/telemetry/batch
 *
 * Returns batch job metrics summary
 */
export async function GET(): Promise<NextResponse> {
  const summary = batchMetrics.getSummary();

  return NextResponse.json(summary, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
