import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TechEntityService } from '@/lib/services/tech-entity-service';
import { TechRelationService } from '@/lib/services/tech-relation-service';
import { TechEntityType } from '@prisma/client';
import { RedisCache } from '@/lib/cache';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import logger from '@/lib/logger';

const VALID_ENTITY_TYPES: string[] = [
  'FRAMEWORK',
  'LANGUAGE',
  'TOOL',
  'CONCEPT',
  'PLATFORM',
  'LIBRARY',
];

// Lazy-init cache (5 min TTL for graph data)
let graphCache: RedisCache | null = null;
const getGraphCache = () => {
  if (!graphCache) {
    graphCache = new RedisCache({
      ttl: 300,
      namespace: '@techtrend/cache:tech-map:graph',
    });
  }
  return graphCache;
};

/**
 * GET /api/tech-map/graph
 *
 * Return graph data (nodes + edges) for visualization.
 *
 * Query params (at least one required):
 *   center      - Entity ID to center graph on
 *   depth       - Graph traversal depth (1-3, default: 1)
 *   minStrength - Minimum relation strength filter (0-1, default: 0)
 *   type        - Filter nodes by TechEntityType
 *   limit       - Max nodes when using type filter (1-100, default: 50)
 *
 * If no filtering params provided, returns 400.
 */
async function handler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const center = searchParams.get('center');
    const typeParam = searchParams.get('type');
    const depthParam = searchParams.get('depth');
    const minStrengthParam = searchParams.get('minStrength');
    const limitParam = searchParams.get('limit');

    // At least one filtering param required
    if (!center && !typeParam) {
      return NextResponse.json(
        {
          error: 'At least one filtering parameter required: center or type',
        },
        { status: 400 }
      );
    }

    // Validate type if provided
    if (typeParam && !VALID_ENTITY_TYPES.includes(typeParam)) {
      return NextResponse.json(
        { error: `Invalid type. Use: ${VALID_ENTITY_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const depth = Math.min(
      3,
      Math.max(1, parseInt(depthParam || '1', 10) || 1)
    );
    const minStrength = Math.max(0, parseFloat(minStrengthParam || '0') || 0);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(limitParam || '50', 10) || 50)
    );

    // Build cache key
    const cache = getGraphCache();
    const cacheKey = cache.generateCacheKey('graph', {
      params: {
        center: center || 'none',
        type: typeParam || 'all',
        depth: depth.toString(),
        minStrength: minStrength.toString(),
        limit: limit.toString(),
      },
    });

    // Check cache (fail-open: cache errors fall through to DB query)
    let cached: {
      nodes: Array<{
        id: string;
        name: string;
        type: string;
        mentionCount: number;
      }>;
      edges: Array<{
        source: string;
        target: string;
        relationType: string;
        strength: number;
      }>;
    } | null = null;
    try {
      cached = await cache.get<typeof cached>(cacheKey);
    } catch (cacheError) {
      logger.warn(
        { error: cacheError },
        'Redis cache read failed, falling back to DB query'
      );
    }
    if (cached) {
      const response = NextResponse.json(cached);
      response.headers.set('X-Cache-Status', 'HIT');
      return response;
    }

    let nodes: Array<{
      id: string;
      name: string;
      type: string;
      mentionCount: number;
    }>;
    let edges: Array<{
      source: string;
      target: string;
      relationType: string;
      strength: number;
    }>;

    if (center) {
      // Graph traversal from center entity
      const relationService = new TechRelationService(prisma);
      const graphData = await relationService.getRelationsForEntity(
        center,
        depth
      );

      nodes = graphData.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        mentionCount: n.mentionCount,
      }));

      edges = graphData.edges
        .filter((e) => e.strength >= minStrength)
        .map((e) => ({
          source: e.sourceEntityId,
          target: e.targetEntityId,
          relationType: e.relationType,
          strength: e.strength,
        }));

      // If type filter also provided, filter nodes (and their edges)
      if (typeParam) {
        const nodeIds = new Set(
          nodes.filter((n) => n.type === typeParam).map((n) => n.id)
        );
        // Always include the center node
        nodeIds.add(center);
        nodes = nodes.filter((n) => nodeIds.has(n.id));
        edges = edges.filter(
          (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
        );
      }
    } else {
      // Type-based listing (no graph traversal)
      const entityService = new TechEntityService(prisma);
      const result = await entityService.search('', {
        type: typeParam as TechEntityType,
        limit,
        sort: 'mentionCount',
      });

      nodes = result.entities.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        mentionCount: n.mentionCount,
      }));
      edges = [];
    }

    // Normalize edge strength to 0-1 range for UI consumption
    // DB stores strength as evidence count (integer); UI expects 0-1
    if (edges.length > 0) {
      const maxStrength = Math.max(...edges.map((e) => e.strength));
      if (maxStrength > 1) {
        edges = edges.map((e) => ({
          ...e,
          strength: e.strength / maxStrength,
        }));
      }
    }

    const responseData = { nodes, edges };

    // Save to cache (fail-open: cache write errors are non-fatal)
    try {
      await cache.set(cacheKey, responseData);
    } catch (cacheError) {
      logger.warn(
        { error: cacheError },
        'Redis cache write failed, response served without caching'
      );
    }

    const response = NextResponse.json(responseData);
    response.headers.set('X-Cache-Status', 'MISS');
    return response;
  } catch (error) {
    logger.error({ error }, 'Error in GET /api/tech-map/graph');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:tech-map-graph', handler);
