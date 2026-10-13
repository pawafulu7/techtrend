/**
 * Memory Telemetry API
 *
 * Provides memory usage statistics for monitoring and alerting.
 */
import { NextResponse } from 'next/server';
import { memoryMonitor } from '@/lib/monitoring/memory-monitor';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';

/**
 * GET /api/telemetry/memory
 *
 * Returns current memory usage and historical statistics
 */
async function getHandler(): Promise<NextResponse> {
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
async function postHandler(): Promise<NextResponse> {
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

// 内部の監視値なので、管理者だけに見せる（Issue #771。以前は誰でも見られた）
export const GET = withAdminAuth(withRateLimit('admin:read', getHandler));
export const POST = withCSRFProtection(
  withRateLimit('admin:write', withAdminAuth(postHandler))
);
