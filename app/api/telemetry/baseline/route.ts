/**
 * API Baseline Telemetry Endpoint
 *
 * Provides API response time baseline comparisons and status.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiBaselineMonitor } from '@/lib/monitoring/api-baseline';
import { createLogger } from '@/lib/logger';

const logger = createLogger('telemetry:baseline');

/**
 * GET /api/telemetry/baseline
 *
 * Returns baseline comparison summary
 */
export async function GET(): Promise<NextResponse> {
  const summary = apiBaselineMonitor.getSummary();

  return NextResponse.json(summary, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

/**
 * Schema for measurement update
 */
const measurementSchema = z.object({
  endpoint: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  p50: z.number().nonnegative(),
  p95: z.number().nonnegative(),
  p99: z.number().nonnegative(),
  count: z.number().nonnegative().int(),
});

/**
 * POST /api/telemetry/baseline
 *
 * Update measurement for an endpoint
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const parsed = measurementSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    apiBaselineMonitor.updateMeasurement({
      ...parsed.data,
      timestamp: Date.now(),
    });

    return NextResponse.json(
      { message: 'Measurement recorded' },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ error }, 'Failed to process baseline measurement');
    return NextResponse.json(
      { error: 'Failed to process measurement' },
      { status: 500 }
    );
  }
}
