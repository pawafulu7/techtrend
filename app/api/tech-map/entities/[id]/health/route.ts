import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TechHealthService } from '@/lib/services/tech-health-service';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { RedisCache } from '@/lib/cache/redis-cache';
import logger from '@/lib/logger';

const CACHE_TTL = 1800; // 30 minutes

const cache = new RedisCache({ namespace: 'techtrend', ttl: CACHE_TTL });
const healthService = new TechHealthService(prisma);

/**
 * GET /api/tech-map/entities/[id]/health
 *
 * Get health history for a specific tech entity.
 *
 * Query params:
 *   days - History range in days (7-365, default: 30, clamped)
 */
async function handler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || typeof id !== 'string' || id.length > 50) {
      return NextResponse.json(
        { error: 'Entity ID is required' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const daysParam = parseInt(searchParams.get('days') || '30', 10);
    const days = Math.min(
      365,
      Math.max(7, Number.isNaN(daysParam) ? 30 : daysParam)
    );

    // Build cache key
    const cacheKey = cache.generateCacheKey('health:entity', {
      params: { id, days },
    });

    const cached = await cache.get<unknown>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Verify entity exists
    const entity = await healthService.getEntity(id);

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    const history = await healthService.getHealthHistory(id, days);

    const response = {
      entity,
      history,
    };

    cache.set(cacheKey, response, CACHE_TTL).catch((err) => {
      logger.warn({ error: err, cacheKey }, 'Failed to cache health response');
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error({ error }, 'Error in GET /api/tech-map/entities/[id]/health');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:tech-map', handler);
