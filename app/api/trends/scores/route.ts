import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TrendScoringService } from '@/lib/services/trend-scoring-service';
import { TechMaturityStage } from '@prisma/client';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { RedisCache } from '@/lib/cache/redis-cache';
import { computeLastUpdatedAt } from '@/lib/utils/trend-helpers';
import logger from '@/lib/logger';

const VALID_STAGES: string[] = Object.values(TechMaturityStage);
const VALID_SORT_FIELDS = ['score', 'name', 'stage'] as const;
const CACHE_TTL = 1800; // 30 minutes

const cache = new RedisCache({ namespace: 'techtrend', ttl: CACHE_TTL });
const trendScoringService = new TrendScoringService(prisma);

/**
 * GET /api/trends/scores
 *
 * List trend scores with optional filtering, sorting, and pagination.
 *
 * Query params:
 *   stage  - TechMaturityStage filter (EMERGING, RISING, ESTABLISHED, DECLINING)
 *   limit  - Max results (1-100, default: 20)
 *   offset - Pagination offset (default: 0)
 *   sort   - Sort field: score | name | stage (default: score)
 */
async function handler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse and validate query params
    const stageParam = searchParams.get('stage');
    if (stageParam && !VALID_STAGES.includes(stageParam)) {
      return NextResponse.json(
        { error: `Invalid stage. Use: ${VALID_STAGES.join(', ')}` },
        { status: 400 }
      );
    }

    const sortParam = searchParams.get('sort') || 'score';
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

    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20)
    );
    const offset = Math.max(
      0,
      parseInt(searchParams.get('offset') || '0', 10) || 0
    );

    // Build cache key
    const cacheKey = cache.generateCacheKey('trend-scores:list', {
      params: {
        stage: stageParam || 'all',
        sort: sortParam,
        limit,
        offset,
      },
    });

    const cached = await cache.get<{
      scores: unknown[];
      total: number;
      lastUpdatedAt: string;
    }>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const result = await trendScoringService.getLatestScores({
      stage: stageParam ? (stageParam as TechMaturityStage) : undefined,
      limit,
      offset,
      sort: sortParam as 'score' | 'name' | 'stage',
    });

    const lastUpdatedAt = computeLastUpdatedAt(result.scores);

    const response = {
      scores: result.scores,
      total: result.total,
      lastUpdatedAt,
    };

    cache.set(cacheKey, response, CACHE_TTL).catch((err) => {
      logger.warn({ error: err, cacheKey }, 'Failed to cache response');
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error({ error }, 'Error in GET /api/trends/scores');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:articles', handler);
