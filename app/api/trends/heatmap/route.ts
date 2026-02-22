import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
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
          WHERE "publishedAt" >= NOW() - INTERVAL '1 day'
          GROUP BY category`,
        previous: prisma.$queryRaw<CategoryRow[]>`
          SELECT category, COUNT(*) as count FROM "Article"
          WHERE "publishedAt" >= NOW() - INTERVAL '2 days'
            AND "publishedAt" < NOW() - INTERVAL '1 day'
          GROUP BY category`,
      };
    case 'week':
      return {
        current: prisma.$queryRaw<CategoryRow[]>`
          SELECT category, COUNT(*) as count FROM "Article"
          WHERE "publishedAt" >= NOW() - INTERVAL '7 days'
          GROUP BY category`,
        previous: prisma.$queryRaw<CategoryRow[]>`
          SELECT category, COUNT(*) as count FROM "Article"
          WHERE "publishedAt" >= NOW() - INTERVAL '14 days'
            AND "publishedAt" < NOW() - INTERVAL '7 days'
          GROUP BY category`,
      };
    case 'month':
      return {
        current: prisma.$queryRaw<CategoryRow[]>`
          SELECT category, COUNT(*) as count FROM "Article"
          WHERE "publishedAt" >= NOW() - INTERVAL '30 days'
          GROUP BY category`,
        previous: prisma.$queryRaw<CategoryRow[]>`
          SELECT category, COUNT(*) as count FROM "Article"
          WHERE "publishedAt" >= NOW() - INTERVAL '60 days'
            AND "publishedAt" < NOW() - INTERVAL '30 days'
          GROUP BY category`,
      };
  }
}

async function handler(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const periodParam = searchParams.get('period') || 'week';

    if (!VALID_PERIODS.includes(periodParam as Period)) {
      return NextResponse.json(
        {
          error: `Invalid period: ${periodParam}. Must be one of: ${VALID_PERIODS.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const period = periodParam as Period;
    const cacheKey = `heatmap:${period}`;

    const heatmapData = await trendsCache.getOrSet(cacheKey, async () => {
      const queries = buildQueries(period);
      const [currentRows, previousRows] = await Promise.all([
        queries.current,
        queries.previous,
      ]);

      const previousMap = new Map<string, number>();
      for (const row of previousRows) {
        const cat = row.category || 'uncategorized';
        previousMap.set(cat, Number(row.count));
      }

      const categories = currentRows
        .map((row) => {
          const name = row.category || 'uncategorized';
          const displayName = row.category || '\u305d\u306e\u4ed6';
          const count = Number(row.count);
          const previousCount = previousMap.get(name) || 0;
          const changeRate =
            previousCount > 0
              ? Math.round(((count - previousCount) / previousCount) * 100)
              : count > 0
                ? 100
                : 0;

          return {
            name,
            displayName,
            count,
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
