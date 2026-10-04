import { NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/services/dashboard-stats';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import logger from '@/lib/logger';
import { applyPublicCacheHeaders } from '@/lib/api/cache-headers';

async function statsHandler() {
  const startTime = Date.now();
  try {
    const { value: stats, cacheHit } = await getDashboardStats();
    const responseTime = Date.now() - startTime;
    const response = NextResponse.json({
      success: true,
      data: stats,
      cache: { hit: cacheHit },
    });
    applyPublicCacheHeaders(response.headers, {
      cacheControl: 'public, s-maxage=300, stale-while-revalidate=600',
      cdnCacheControl: 'max-age=600',
    });
    response.headers.set('Vary', 'Accept-Encoding');
    response.headers.set('X-Cache-Status', cacheHit ? 'HIT' : 'MISS');
    response.headers.set('X-Response-Time', `${responseTime}ms`);
    logger.info(
      { route: '/api/stats', cacheHit, responseTime },
      'Stats API response'
    );
    return response;
  } catch (error) {
    logger.error(
      { err: error, route: '/api/stats', responseTime: Date.now() - startTime },
      'Stats API error'
    );
    return NextResponse.json(
      { success: false, error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('public:stats', statsHandler);
