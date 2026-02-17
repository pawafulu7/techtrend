import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MetricSource } from '@prisma/client';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import logger from '@/lib/logger';

const VALID_METRIC_SOURCES: string[] = [
  'GITHUB_STARS',
  'NPM_DOWNLOADS',
  'PYPI_DOWNLOADS',
  'SO_QUESTIONS',
];

/**
 * GET /api/tech-map/entities/[id]/metrics
 *
 * Get external metrics for a tech entity with optional filtering.
 *
 * Query params:
 *   source - MetricSource enum filter
 *   from   - ISO date string for range start
 *   to     - ISO date string for range end
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
    const sourceParam = searchParams.get('source');
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    // Validate source
    if (sourceParam && !VALID_METRIC_SOURCES.includes(sourceParam)) {
      return NextResponse.json(
        {
          error: `Invalid source. Use: ${VALID_METRIC_SOURCES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Validate date params
    if (fromParam && isNaN(Date.parse(fromParam))) {
      return NextResponse.json(
        { error: 'Invalid from date format. Use ISO 8601 (e.g., 2025-01-01)' },
        { status: 400 }
      );
    }
    if (toParam && isNaN(Date.parse(toParam))) {
      return NextResponse.json(
        { error: 'Invalid to date format. Use ISO 8601 (e.g., 2026-02-17)' },
        { status: 400 }
      );
    }

    // Verify entity exists
    const entity = await prisma.techEntity.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    // Build where clause
    const where: Record<string, unknown> = { entityId: id };

    if (sourceParam) {
      where.source = sourceParam as MetricSource;
    }

    const measuredAtFilter: Record<string, Date> = {};
    if (fromParam) {
      measuredAtFilter.gte = new Date(fromParam);
    }
    if (toParam) {
      measuredAtFilter.lte = new Date(toParam);
    }
    if (Object.keys(measuredAtFilter).length > 0) {
      where.measuredAt = measuredAtFilter;
    }

    const metrics = await prisma.externalMetric.findMany({
      where,
      orderBy: { measuredAt: 'desc' },
    });

    return NextResponse.json({ metrics });
  } catch (error) {
    logger.error({ error }, 'Error in GET /api/tech-map/entities/[id]/metrics');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:tech-map', handler);
