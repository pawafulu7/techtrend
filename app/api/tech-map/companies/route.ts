import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TechEntityType } from '@prisma/client';
import { CompanyTechAnalysisService } from '@/lib/services/company-tech-analysis-service';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { RedisCache } from '@/lib/cache/redis-cache';
import logger from '@/lib/logger';

const CACHE_TTL = 3600; // 1 hour
const VALID_ENTITY_TYPES: string[] = Object.values(TechEntityType);

const cache = new RedisCache({ namespace: 'techtrend', ttl: CACHE_TTL });
const service = new CompanyTechAnalysisService(prisma);

/**
 * GET /api/tech-map/companies
 *
 * Get company x technology mention matrix.
 *
 * Query params:
 *   minMentions  - Minimum mentions to include (default: 2)
 *   limit        - Max companies (1-50, default: 30)
 *   techLimit    - Max technologies (1-50, default: 30)
 *   entityTypes  - Comma-separated TechEntityType filter
 */
async function handler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse and validate query params
    const minMentionsParam = parseInt(
      searchParams.get('minMentions') || '2',
      10
    );
    const minMentions = Math.max(
      1,
      Number.isNaN(minMentionsParam) ? 2 : minMentionsParam
    );

    const limitParam = parseInt(searchParams.get('limit') || '30', 10);
    const companyLimit = Math.min(
      50,
      Math.max(1, Number.isNaN(limitParam) ? 30 : limitParam)
    );

    const techLimitParam = parseInt(searchParams.get('techLimit') || '30', 10);
    const techLimit = Math.min(
      50,
      Math.max(1, Number.isNaN(techLimitParam) ? 30 : techLimitParam)
    );

    // Parse entityTypes (comma-separated)
    const entityTypesParam = searchParams.get('entityTypes');
    let entityTypes: TechEntityType[] | undefined;
    if (entityTypesParam) {
      const types = entityTypesParam.split(',').map((t) => t.trim());
      const invalid = types.filter((t) => !VALID_ENTITY_TYPES.includes(t));
      if (invalid.length > 0) {
        return NextResponse.json(
          {
            error: `Invalid entityTypes: ${invalid.join(', ')}. Valid: ${VALID_ENTITY_TYPES.join(', ')}`,
          },
          { status: 400 }
        );
      }
      entityTypes = types as TechEntityType[];
    }

    // Build cache key
    const cacheKey = cache.generateCacheKey('company-matrix', {
      params: {
        minMentions,
        companyLimit,
        techLimit,
        entityTypes: entityTypes?.join(',') || 'all',
      },
    });

    const cached = await cache.get<unknown>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const result = await service.getMatrix({
      minMentions,
      companyLimit,
      techLimit,
      entityTypes,
    });

    cache.set(cacheKey, result, CACHE_TTL).catch((err) => {
      logger.warn({ error: err, cacheKey }, 'Failed to cache company matrix');
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ error }, 'Error in GET /api/tech-map/companies');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:tech-map', handler);
