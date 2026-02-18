import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TrendScoringService } from '@/lib/services/trend-scoring-service';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { RedisCache } from '@/lib/cache/redis-cache';
import logger from '@/lib/logger';

const CACHE_TTL = 1800; // 30 minutes

const cache = new RedisCache({ namespace: 'techtrend', ttl: CACHE_TTL });

/**
 * GET /api/tech-map/entities/[id]/trend
 *
 * Get trend score and history for a specific tech entity.
 *
 * Query params:
 *   days - History range in days (7-365, default: 90)
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
    const daysParam = parseInt(searchParams.get('days') || '90', 10);
    const days = Math.min(
      365,
      Math.max(7, Number.isNaN(daysParam) ? 90 : daysParam)
    );

    // Build cache key
    const cacheKey = cache.generateCacheKey('entity-trend', {
      params: { id, days },
    });

    const cached = await cache.get<unknown>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Verify entity exists
    const entity = await prisma.techEntity.findUnique({
      where: { id },
      select: { id: true, name: true, type: true },
    });

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    const service = new TrendScoringService(prisma);

    // Get current score and history in parallel
    const [latestScoreRecord, history] = await Promise.all([
      prisma.techTrendScore.findFirst({
        where: { entityId: id },
        orderBy: { calculatedAt: 'desc' },
      }),
      service.getScoreHistory(id, days),
    ]);

    const currentScore = latestScoreRecord
      ? {
          entityId: entity.id,
          entityName: entity.name,
          entityType: entity.type,
          score: latestScoreRecord.score,
          components: {
            articleMentionGrowth: latestScoreRecord.articleMentionGrowth,
            githubStarsGrowth: latestScoreRecord.githubStarsGrowth,
            npmDownloadsGrowth: latestScoreRecord.npmDownloadsGrowth,
            soQuestionsGrowth: latestScoreRecord.soQuestionsGrowth,
          },
          stage: latestScoreRecord.stage,
          calculatedAt: latestScoreRecord.calculatedAt.toISOString(),
        }
      : null;

    const response = {
      entity,
      currentScore,
      history,
    };

    await cache.set(cacheKey, response, CACHE_TTL);

    return NextResponse.json(response);
  } catch (error) {
    logger.error({ error }, 'Error in GET /api/tech-map/entities/[id]/trend');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:tech-map', handler);
