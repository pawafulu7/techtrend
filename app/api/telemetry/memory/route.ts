/**
 * Memory Telemetry API
 *
 * Provides memory usage statistics for monitoring and alerting.
 */
import { NextResponse } from 'next/server';
import { memoryMonitor } from '@/lib/monitoring/memory-monitor';

/**
 * GET /api/telemetry/memory
 *
 * Returns current memory usage and historical statistics
 */
export async function GET(): Promise<NextResponse> {
  const summary = memoryMonitor.getSummary();

  return NextResponse.json(summary, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

/**
 * POST /api/telemetry/memory/sample
 *
 * Triggers a manual memory sample
 */
export async function POST(): Promise<NextResponse> {
  const stats = memoryMonitor.sample();

  return NextResponse.json(
    {
      message: 'Memory sample recorded',
      stats,
    },
    {
      status: 201,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
