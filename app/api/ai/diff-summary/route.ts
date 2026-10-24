/**
 * Diff Summary API Route
 *
 * GET: Retrieve diff summaries for categories
 * （生成は scripts/ai/generate-diff-summaries.ts の週次バッチ）
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { BatchStatus } from '@/lib/prisma-exports';
import { getISOWeek, getPreviousISOWeek } from '@/lib/ai/diff-summary/iso-week';
import {
  SOURCE_CATEGORIES,
  SourceCategoryId,
} from '@/lib/constants/source-categories';
import { RedisCache } from '@/lib/cache';
import logger from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { DiffChange } from '@/lib/ai/extraction/extraction-schemas';
import { publicCacheHeaders } from '@/lib/api/cache-headers';

// Cache instance (lazy initialized)
let cache: RedisCache | null = null;

const getCache = () => {
  if (!cache) {
    cache = new RedisCache({
      ttl: 3600, // 1 hour
      namespace: '@techtrend/cache:diff-summary',
    });
  }
  return cache;
};

/**
 * GET /api/ai/diff-summary
 *
 * Query Parameters:
 * - week: ISO week format (YYYY-Www), default: current week
 * - category: Specific category slug (optional)
 */
async function getDiffSummaryHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const weekParam = searchParams.get('week');
    const categoryParam = searchParams.get('category');

    // Validate week format and range (01-53)
    let week = weekParam;
    if (week) {
      const weekMatch = week.match(/^(\d{4})-W(\d{2})$/);
      if (!weekMatch) {
        return NextResponse.json(
          { error: 'Invalid week format. Use YYYY-Www (e.g., 2026-W01)' },
          { status: 400 }
        );
      }
      const weekNum = parseInt(weekMatch[2], 10);
      if (weekNum < 1 || weekNum > 53) {
        return NextResponse.json(
          { error: 'Invalid week number. Must be between 01 and 53' },
          { status: 400 }
        );
      }
    }
    week = week || getISOWeek(new Date());

    // Validate category if provided
    if (
      categoryParam &&
      !SOURCE_CATEGORIES[categoryParam as SourceCategoryId]
    ) {
      return NextResponse.json(
        {
          error: 'Invalid category',
          validCategories: Object.keys(SOURCE_CATEGORIES),
        },
        { status: 400 }
      );
    }

    // Cache key
    const cacheKey = `diff-summary:${week}:${categoryParam || 'all'}`;
    const cacheInstance = getCache();

    // Try cache
    try {
      const cached = await cacheInstance.get<object>(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: {
            'X-Cache': 'HIT',
            ...publicCacheHeaders({ cacheControl: 'public, max-age=300' }),
          },
        });
      }
    } catch (cacheError) {
      logger.warn({ err: cacheError }, 'Cache read error');
    }

    // Query database
    const whereClause = {
      currentPeriod: week,
      status: BatchStatus.SUCCESS,
      ...(categoryParam && { categorySlug: categoryParam }),
    };

    let summaries = await prisma.diffSummary.findMany({
      where: whereClause,
      orderBy: { generatedAt: 'desc' },
    });

    // Fallback: if no data for the requested week, find the latest available week
    let isFallback = false;
    const requestedWeek = week;
    if (summaries.length === 0) {
      const latestRecord = await prisma.diffSummary.findFirst({
        where: {
          status: BatchStatus.SUCCESS,
          ...(categoryParam && { categorySlug: categoryParam }),
        },
        orderBy: { currentPeriod: 'desc' },
        select: { currentPeriod: true },
      });

      if (latestRecord) {
        isFallback = true;
        week = latestRecord.currentPeriod;

        summaries = await prisma.diffSummary.findMany({
          where: {
            currentPeriod: week,
            status: BatchStatus.SUCCESS,
            ...(categoryParam && { categorySlug: categoryParam }),
          },
          orderBy: { generatedAt: 'desc' },
        });

        // Guard: if records were deleted between findFirst and findMany (TOCTOU),
        // revert to non-fallback state to avoid returning isFallback:true with no data.
        if (summaries.length === 0) {
          isFallback = false;
          week = requestedWeek;
        }
      }
    }

    // Transform response
    const response = {
      success: true,
      week,
      previousWeek: getPreviousISOWeek(week),
      ...(isFallback && { isFallback: true, requestedWeek }),
      data: summaries.map((s) => ({
        categorySlug: s.categorySlug,
        categoryName:
          SOURCE_CATEGORIES[s.categorySlug as SourceCategoryId]?.name ||
          s.categorySlug,
        currentPeriod: s.currentPeriod,
        baselinePeriod: s.baselinePeriod,
        changes: s.changes as DiffChange[],
        unchanged: s.unchanged,
        modelVersion: s.modelVersion,
        promptVersion: s.promptVersion,
        generatedAt: s.generatedAt.toISOString(),
      })),
      meta: {
        totalCategories: Object.keys(SOURCE_CATEGORIES).length,
        summarizedCategories: summaries.length,
      },
    };

    // Only cache non-fallback responses with actual data
    // Fallback responses contain request-specific metadata (requestedWeek) that would
    // pollute the cache if stored under the actual week's key
    if (summaries.length > 0 && !isFallback) {
      try {
        await cacheInstance.set(cacheKey, response);
      } catch (cacheError) {
        logger.warn({ err: cacheError }, 'Cache write error');
      }
    }

    return NextResponse.json(response, {
      headers: {
        'X-Cache': 'MISS',
        ...publicCacheHeaders({
          cacheControl: isFallback
            ? 'public, max-age=60'
            : 'public, max-age=300',
        }),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get diff summaries');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:diff-summary', getDiffSummaryHandler);
