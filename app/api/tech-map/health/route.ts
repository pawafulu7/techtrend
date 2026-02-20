import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TechHealthService } from '@/lib/services/tech-health-service';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { RedisCache } from '@/lib/cache/redis-cache';
import logger from '@/lib/logger';

const VALID_SORT_FIELDS = [
  'overallHealth',
  'communityActivity',
  'developmentVelocity',
  'articleAttention',
  'adoptionBreadth',
] as const;
const VALID_ORDERS = ['asc', 'desc'] as const;
const CACHE_TTL = 1800; // 30 minutes

const cache = new RedisCache({ namespace: 'techtrend', ttl: CACHE_TTL });
const healthService = new TechHealthService(prisma);

/**
 * GET /api/tech-map/health
 *
 * List health scores with optional filtering, sorting, and pagination.
 *
 * Query params:
 *   sort     - Sort field (default: overallHealth)
 *   order    - asc | desc (default: desc)
 *   limit    - Max results (1-50, default: 20)
 *   offset   - Pagination offset (default: 0)
 *   search   - Entity name search (case-insensitive contains)
 *   minScore - Minimum overallHealth (0-100)
 *   maxScore - Maximum overallHealth (0-100)
 */
async function handler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse and validate sort
    const sortParam = searchParams.get('sort') || 'overallHealth';
    if (
      !VALID_SORT_FIELDS.includes(
        sortParam as (typeof VALID_SORT_FIELDS)[number]
      )
    ) {
      return NextResponse.json(
        { error: `Invalid sort. Use: ${VALID_SORT_FIELDS.join(', ')}` },
        { status: 400 }
      );
    }

    // Parse and validate order
    const orderParam = searchParams.get('order') || 'desc';
    if (!VALID_ORDERS.includes(orderParam as (typeof VALID_ORDERS)[number])) {
      return NextResponse.json(
        { error: `Invalid order. Use: ${VALID_ORDERS.join(', ')}` },
        { status: 400 }
      );
    }

    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20)
    );
    const offset = Math.max(
      0,
      parseInt(searchParams.get('offset') || '0', 10) || 0
    );

    const searchRaw = searchParams.get('search');
    const search = searchRaw
      ? searchRaw.slice(0, 100).trim() || undefined
      : undefined;

    const minScoreParam = searchParams.get('minScore');
    const maxScoreParam = searchParams.get('maxScore');
    const minScoreRaw = minScoreParam ? parseFloat(minScoreParam) : undefined;
    const maxScoreRaw = maxScoreParam ? parseFloat(maxScoreParam) : undefined;
    const minScore =
      minScoreRaw !== undefined && Number.isFinite(minScoreRaw)
        ? Math.max(0, Math.min(100, minScoreRaw))
        : undefined;
    const maxScore =
      maxScoreRaw !== undefined && Number.isFinite(maxScoreRaw)
        ? Math.max(0, Math.min(100, maxScoreRaw))
        : undefined;

    // Build cache key
    const cacheKey = cache.generateCacheKey('health:list', {
      params: {
        sort: sortParam,
        order: orderParam,
        limit,
        offset,
        search: search || 'all',
        minScore: minScore ?? 'none',
        maxScore: maxScore ?? 'none',
      },
    });

    const cached = await cache.get<{
      data: unknown[];
      total: number;
      limit: number;
      offset: number;
    }>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const result = await healthService.getLatestHealth({
      sort: sortParam as (typeof VALID_SORT_FIELDS)[number],
      order: orderParam as 'asc' | 'desc',
      limit,
      offset,
      search,
      minScore,
      maxScore,
    });

    const response = {
      data: result.data,
      total: result.total,
      limit,
      offset,
    };

    cache.set(cacheKey, response, CACHE_TTL).catch((err) => {
      logger.warn({ error: err, cacheKey }, 'Failed to cache health response');
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error({ error }, 'Error in GET /api/tech-map/health');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:tech-map', handler);
