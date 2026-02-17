import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TechEntityService } from '@/lib/services/tech-entity-service';
import { TechEntityType } from '@prisma/client';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import logger from '@/lib/logger';

const VALID_ENTITY_TYPES: string[] = Object.values(TechEntityType);

const VALID_SORT_FIELDS = ['mentionCount', 'lastSeenAt', 'name'] as const;

/**
 * GET /api/tech-map/entities
 *
 * List/search tech entities with optional filtering, sorting, and pagination.
 *
 * Query params:
 *   type     - TechEntityType enum filter
 *   sort     - Sort field: mentionCount | lastSeenAt | name
 *   limit    - Max results (1-100, default: 20)
 *   offset   - Pagination offset (default: 0)
 *   search   - Text search on entity name/aliases
 */
async function handler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse and validate query params
    const typeParam = searchParams.get('type');
    if (typeParam && !VALID_ENTITY_TYPES.includes(typeParam)) {
      return NextResponse.json(
        {
          error: `Invalid type. Use: ${VALID_ENTITY_TYPES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const sortParam = searchParams.get('sort') || 'mentionCount';
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
    const search = searchParams.get('search') || '';

    const service = new TechEntityService(prisma);
    const result = await service.search(search, {
      type: typeParam ? (typeParam as TechEntityType) : undefined,
      sort: sortParam as 'mentionCount' | 'lastSeenAt' | 'name',
      limit,
      offset,
    });

    return NextResponse.json({
      entities: result.entities,
      total: result.total,
    });
  } catch (error) {
    logger.error({ error }, 'Error in GET /api/tech-map/entities');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:tech-map', handler);
