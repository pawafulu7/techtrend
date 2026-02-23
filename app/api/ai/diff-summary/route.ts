/**
 * Diff Summary API Route
 *
 * GET: Retrieve diff summaries for categories
 * POST: Generate diff summaries (admin/cron only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { BatchStatus } from '@prisma/client';
import {
  getDiffSummaryService,
  getISOWeek,
  getPreviousISOWeek,
} from '@/lib/ai/diff-summary';
import {
  SOURCE_CATEGORIES,
  SourceCategoryId,
} from '@/lib/constants/source-categories';
import { RedisCache } from '@/lib/cache';
import logger from '@/lib/logger/index';
import { withCronOrAdminAuth } from '@/lib/middleware/with-cron-or-admin-auth';
import { DiffChange } from '@/lib/ai/extraction/extraction-schemas';

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
export async function GET(request: NextRequest) {
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
            'Cache-Control': 'public, max-age=300',
          },
        });
      }
    } catch (cacheError) {
      logger.warn('Cache read error', cacheError);
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
        distinct: ['currentPeriod'],
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

    // Save to cache only if there's actual data
    // Empty responses and fallback responses should not be cached under the requested key
    if (summaries.length > 0) {
      const actualCacheKey = isFallback
        ? `diff-summary:${week}:${categoryParam || 'all'}`
        : cacheKey;
      try {
        await cacheInstance.set(actualCacheKey, response);
      } catch (cacheError) {
        logger.warn('Cache write error', cacheError);
      }
    }

    return NextResponse.json(response, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    logger.error('Failed to get diff summaries', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai/diff-summary
 * Generate diff summaries (admin/cron only)
 *
 * Body:
 * - week: ISO week format (optional, default: current week)
 * - category: Specific category slug (optional, default: all)
 */
async function generateDiffSummaryHandler(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const weekParam = body.week;
    const categoryParam = body.category;

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
    const baseline = getPreviousISOWeek(week);

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

    const service = getDiffSummaryService();

    let result;
    const cacheInstance = getCache();

    if (categoryParam) {
      // Single category
      result = await service.generateForCategory(
        categoryParam as SourceCategoryId,
        week,
        baseline
      );

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Generation failed' },
          { status: 500 }
        );
      }

      // Invalidate cache for this category and 'all' view
      try {
        await Promise.all([
          cacheInstance.del(`diff-summary:${week}:${categoryParam}`),
          cacheInstance.del(`diff-summary:${week}:all`),
        ]);
      } catch (cacheError) {
        logger.warn('Cache invalidation error', cacheError);
      }

      return NextResponse.json({
        success: true,
        message: `Diff summary generated for ${categoryParam}`,
        week,
        baseline,
        result,
      });
    } else {
      // All categories
      result = await service.generateForAllCategories(week, baseline);

      // Invalidate cache for all categories (parallelized)
      try {
        const cacheKeys = [
          `diff-summary:${week}:all`,
          ...Object.keys(SOURCE_CATEGORIES).map(
            (cat) => `diff-summary:${week}:${cat}`
          ),
        ];
        await Promise.all(cacheKeys.map((key) => cacheInstance.del(key)));
      } catch (cacheError) {
        logger.warn('Cache invalidation error', cacheError);
      }

      return NextResponse.json({
        success: true,
        message: 'Diff summaries generated',
        week,
        baseline,
        summary: {
          total: result.total,
          successful: result.successful,
          failed: result.failed,
        },
      });
    }
  } catch (error) {
    logger.error('Failed to generate diff summaries', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Wrap with auth middleware for POST
export const POST = withCronOrAdminAuth(generateDiffSummaryHandler);
