import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  CompanyTechAnalysisService,
  CompanyNotFoundError,
} from '@/lib/services/company-tech-analysis-service';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { RedisCache } from '@/lib/cache/redis-cache';
import { CACHE_TTL } from '@/lib/cache/constants';
import logger from '@/lib/logger';

const cache = new RedisCache({
  namespace: 'techtrend',
  ttl: CACHE_TTL.VERY_LONG,
});
const service = new CompanyTechAnalysisService(prisma);

/**
 * GET /api/tech-map/companies/[groupId]
 *
 * Get technology timeline for a specific company (SourceGroup).
 *
 * Query params:
 *   months - Timeline range in months (1-24, default: 12)
 */
async function handler(
  request: NextRequest,
  context: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await context.params;

    if (!groupId || typeof groupId !== 'string') {
      return NextResponse.json(
        { error: 'groupId is required' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const monthsParam = parseInt(searchParams.get('months') || '12', 10);
    const months = Math.min(
      24,
      Math.max(1, Number.isNaN(monthsParam) ? 12 : monthsParam)
    );

    // Build cache key
    const cacheKey = cache.generateCacheKey('company-timeline', {
      params: { groupId, months },
    });

    const cached = await cache.get<unknown>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const result = await service.getCompanyTimeline(groupId, months);

    cache.set(cacheKey, result, CACHE_TTL.VERY_LONG).catch((err) => {
      logger.warn({ error: err, cacheKey }, 'Failed to cache company timeline');
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CompanyNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    logger.error({ error }, 'Error in GET /api/tech-map/companies/[groupId]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:tech-map', handler);
