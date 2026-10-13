/**
 * API Baseline Telemetry Endpoint
 *
 * Provides API response time baseline comparisons and status.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiBaselineMonitor } from '@/lib/monitoring/api-baseline';
import { createLogger } from '@/lib/logger';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';

const logger = createLogger('telemetry:baseline');

/**
 * GET /api/telemetry/baseline
 *
 * Returns baseline comparison summary
 */
async function getHandler(): Promise<NextResponse> {
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
  // apiBaselineMonitor は空の endpoint と有限でない値を保存しないので、ここでも 400 にする
  // （受けて 201 を返すと、保存されなかったことに送り手が気づけない）
  endpoint: z.string().min(1),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  p50: z.number().finite().nonnegative(),
  p95: z.number().finite().nonnegative(),
  p99: z.number().finite().nonnegative(),
  count: z.number().nonnegative().int(),
});

/**
 * POST /api/telemetry/baseline
 *
 * Update measurement for an endpoint
 */
async function postHandler(request: NextRequest): Promise<NextResponse> {
  try {
    // JSON として読めない本文は、形の合わない本文と同じく 400 にする（500 にしない）
    const body: unknown = await request.json().catch(() => undefined);
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
    logger.error({ err: error }, 'Failed to process baseline measurement');
    return NextResponse.json(
      { error: 'Failed to process measurement' },
      { status: 500 }
    );
  }
}

// 内部の監視値なので、管理者だけに見せる（Issue #771。以前は誰でも見られた）
export const GET = withAdminAuth(withRateLimit('admin:read', getHandler));
export const POST = withCSRFProtection(
  withRateLimit('admin:write', withAdminAuth(postHandler))
);
