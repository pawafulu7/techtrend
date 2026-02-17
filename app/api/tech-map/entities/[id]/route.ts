import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TechRelationService } from '@/lib/services/tech-relation-service';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import logger from '@/lib/logger';

/**
 * GET /api/tech-map/entities/[id]
 *
 * Get a single tech entity by ID with optional relations and metrics.
 *
 * Query params:
 *   include - Comma-separated: relations, metrics
 */
async function handler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Entity ID is required' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const includeParam = searchParams.get('include') || '';
    const includes = includeParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const includeRelations = includes.includes('relations');
    const includeMetrics = includes.includes('metrics');

    // Fetch entity
    const entity = await prisma.techEntity.findUnique({
      where: { id },
    });

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    // Build response
    const responseData: Record<string, unknown> = { entity };

    // Optionally include relations
    if (includeRelations) {
      const relationService = new TechRelationService(prisma);
      const graphData = await relationService.getRelationsForEntity(id, 1);

      // Build name lookup from nodes
      const nameMap = new Map<string, string>();
      for (const node of graphData.nodes) {
        nameMap.set(node.id, node.name);
      }

      // Normalize strength to 0-1 range for UI consumption
      // DB stores strength as evidence count (integer); UI expects 0-1
      const rawEdges = graphData.edges;
      const maxStrength =
        rawEdges.length > 0
          ? rawEdges.reduce((max, e) => Math.max(max, e.strength), 0)
          : 0;
      if (rawEdges.length > 0 && maxStrength > 1) {
        responseData.relations = rawEdges.map((e) => ({
          ...e,
          strength: e.strength / maxStrength,
          sourceEntityName: nameMap.get(e.sourceEntityId),
          targetEntityName: nameMap.get(e.targetEntityId),
        }));
      } else {
        responseData.relations = rawEdges.map((e) => ({
          ...e,
          sourceEntityName: nameMap.get(e.sourceEntityId),
          targetEntityName: nameMap.get(e.targetEntityId),
        }));
      }
    }

    // Optionally include recent metrics
    if (includeMetrics) {
      const metrics = await prisma.externalMetric.findMany({
        where: { entityId: id },
        orderBy: { measuredAt: 'desc' },
        take: 20,
      });
      responseData.recentMetrics = metrics;
    }

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error({ error }, 'Error in GET /api/tech-map/entities/[id]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:tech-map', handler);
