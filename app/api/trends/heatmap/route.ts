import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { trendsCache } from '@/lib/cache/trends-cache';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import logger from '@/lib/logger';

type Period = 'day' | 'week' | 'month';

const VALID_PERIODS: Period[] = ['day', 'week', 'month'];

interface CategoryRow {
  category: string | null;
  count: bigint;
}

function buildQueries(period: Period) {
  switch (period) {
    case 'day':
      return {
        current: prisma.$queryRaw<CategoryRow[]>`
          SELECT category, COUNT(*) as count FROM "Article"
          WHERE "publishedAt" >= CURRENT_DATE - INTERVAL '1 day'
            AND "publishedAt" < CURRENT_DATE
            AND "isHidden" = false
          GROUP BY category`,
        previous: prisma.$queryRaw<CategoryRow[]>`
          SELECT category, COUNT(*) as count FROM "Article"
          WHERE "publishedAt" >= CURRENT_DATE - INTERVAL '2 days'
            AND "publishedAt" < CURRENT_DATE - INTERVAL '1 day'
            AND "isHidden" = false
          GROUP BY category`,
      };
    case 'week':
      return {
        current: prisma.$queryRaw<CategoryRow[]>`
          SELECT category, COUNT(*) as count FROM "Article"
          WHERE "publishedAt" >= CURRENT_DATE - INTERVAL '7 days'
            AND "publishedAt" < CURRENT_DATE
            AND "isHidden" = false
          GROUP BY category`,
        previous: prisma.$queryRaw<CategoryRow[]>`
          SELECT category, COUNT(*) as count FROM "Article"
          WHERE "publishedAt" >= CURRENT_DATE - INTERVAL '14 days'
            AND "publishedAt" < CURRENT_DATE - INTERVAL '7 days'
            AND "isHidden" = false
          GROUP BY category`,
      };
    case 'month':
      return {
        current: prisma.$queryRaw<CategoryRow[]>`
          SELECT category, COUNT(*) as count FROM "Article"
          WHERE "publishedAt" >= CURRENT_DATE - INTERVAL '30 days'
            AND "publishedAt" < CURRENT_DATE
            AND "isHidden" = false
          GROUP BY category`,
        previous: prisma.$queryRaw<CategoryRow[]>`
          SELECT category, COUNT(*) as count FROM "Article"
          WHERE "publishedAt" >= CURRENT_DATE - INTERVAL '60 days'
            AND "publishedAt" < CURRENT_DATE - INTERVAL '30 days'
            AND "isHidden" = false
          GROUP BY category`,
      };
  }
}

async function handler(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const periodParam = searchParams.get('period') || 'week';

    if (!VALID_PERIODS.includes(periodParam as Period)) {
      logger.warn({ periodParam }, 'Invalid period parameter received');
      return NextResponse.json(
        {
          error: `Invalid period parameter. Must be one of: ${VALID_PERIODS.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const period = periodParam as Period;
    const cacheKey = `heatmap:v3:${period}`;

    const heatmapData = await trendsCache.getOrSet(cacheKey, async () => {
      const queries = buildQueries(period);
      const [currentRows, previousRows] = await Promise.all([
        queries.current,
        queries.previous,
      ]);

      // Filter out uncategorized (null category) articles
      const currentCategorized = currentRows.filter((r) => r.category != null);
      const previousCategorized = previousRows.filter(
        (r) => r.category != null
      );

      // Calculate totals for share-based calculation
      const currentTotal = currentCategorized.reduce(
        (sum, r) => sum + Number(r.count),
        0
      );
      const previousTotal = previousCategorized.reduce(
        (sum, r) => sum + Number(r.count),
        0
      );

      const previousShareMap = new Map<string, number>();
      if (previousTotal > 0) {
        for (const row of previousCategorized) {
          const share = (Number(row.count) / previousTotal) * 100;
          previousShareMap.set(row.category!, share);
        }
      }

      const categories = currentCategorized
        .map((row) => {
          const count = Number(row.count);
          const currentShare =
            currentTotal > 0 ? (count / currentTotal) * 100 : 0;
          const previousShare = previousShareMap.get(row.category!) ?? 0;
          // changeRate = difference in share (percentage points)
          const changeRate =
            previousTotal > 0
              ? Math.round((currentShare - previousShare) * 10) / 10
              : 0;

          return {
            category: row.category!,
            label: row.category!,
            count,
            share: Math.round(currentShare * 10) / 10,
            previousShare: Math.round(previousShare * 10) / 10,
            changeRate,
          };
        })
        .filter((cat) => cat.count > 0)
        .sort((a, b) => b.count - a.count);

      return {
        period,
        categories,
        generatedAt: new Date().toISOString(),
      };
    });

    const response = NextResponse.json(heatmapData);
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=600'
    );

    return response;
  } catch (error) {
    logger.error({ error }, 'Heatmap API error');
    return NextResponse.json(
      { error: 'Failed to fetch heatmap data' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:heatmap', handler);
