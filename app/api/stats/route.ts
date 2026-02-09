import { NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { RedisCache } from '@/lib/cache';
import logger from '@/lib/logger';

// Optimized cache configuration: 5-minute TTL for stats
const statsCache = new RedisCache({
  ttl: 300, // 5 minutes (optimized from 1 hour)
  namespace: '@techtrend/cache:stats:v2',
});

export async function GET() {
  const startTime = Date.now();

  try {
    // Generate cache key for stats with version
    const cacheKey = 'stats:dashboard:v2';

    // Try to get stats from cache first
    type StatsPayload = {
      overview: {
        total: number;
        last7Days: number;
        last30Days: number;
        averagePerDay: number;
      };
      sources: {
        id: string;
        name: string;
        count: number;
        percentage: number;
      }[];
      daily: { date: string; total: number; sources: Record<string, number> }[];
      tags: { id: string; name: string; count: number }[];
    };
    const cachedStats = await statsCache.get<StatsPayload>(cacheKey);

    if (cachedStats) {
      const responseTime = Date.now() - startTime;
      const response = NextResponse.json({
        success: true,
        data: cachedStats,
        cache: {
          hit: true,
        },
      });

      // Add cache headers for browser caching and performance metrics
      response.headers.set(
        'Cache-Control',
        'public, s-maxage=300, stale-while-revalidate=600'
      );
      response.headers.set('CDN-Cache-Control', 'max-age=600');
      response.headers.set('Vary', 'Accept-Encoding');
      response.headers.set('X-Cache-Status', 'HIT');
      response.headers.set('X-Response-Time', `${responseTime}ms`);

      logger.info(
        {
          route: '/api/stats',
          cacheHit: true,
          responseTime,
        },
        'Stats API cache hit'
      );

      return response;
    }

    // If not in cache, fetch from database
    const stats = await (async () => {
      // 記事の統計情報を取得
      const [
        totalArticles,
        articlesLast7Days,
        articlesLast30Days,
        sourceStats,
        dailyStats,
        popularTags,
      ] = await Promise.all([
        // 総記事数
        prisma.article.count(),

        // 過去7日間の記事数
        prisma.article.count({
          where: {
            publishedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        }),

        // 過去30日間の記事数
        prisma.article.count({
          where: {
            publishedAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        }),

        // ソース別統計
        prisma.source.findMany({
          where: { enabled: true },
          include: {
            _count: {
              select: { articles: true },
            },
          },
          orderBy: {
            articles: {
              _count: 'desc',
            },
          },
        }),

        // 日別統計（過去30日）- ソース別内訳付き
        prisma.$queryRaw`
        SELECT 
          TO_CHAR(a."publishedAt", 'YYYY-MM-DD') as date,
          s.name as "sourceName",
          COUNT(*)::int as count
        FROM "Article" a
        JOIN "Source" s ON a."sourceId" = s.id
        WHERE a."publishedAt" >= NOW() - INTERVAL '30 days'
        GROUP BY TO_CHAR(a."publishedAt", 'YYYY-MM-DD'), s.name
        ORDER BY date DESC, count DESC
      ` as Promise<{ date: string; sourceName: string; count: number }[]>,

        // 人気タグTOP10
        prisma.tag.findMany({
          include: {
            _count: {
              select: { articles: true },
            },
          },
          orderBy: {
            articles: {
              _count: 'desc',
            },
          },
          take: 10,
        }),
      ]);

      // レスポンスデータを整形
      const formattedStats = {
        overview: {
          total: totalArticles,
          last7Days: articlesLast7Days,
          last30Days: articlesLast30Days,
          averagePerDay: Math.round(articlesLast30Days / 30),
        },
        sources: sourceStats.map((source) => ({
          id: source.id,
          name: source.name,
          count: source._count.articles,
          percentage:
            totalArticles > 0
              ? Math.round((source._count.articles / totalArticles) * 1000) / 10
              : 0,
        })),
        daily: (() => {
          // 日付ごとにグループ化してソース別内訳を集計
          const grouped = dailyStats.reduce(
            (acc, curr) => {
              const date = curr.date;
              if (!acc[date]) {
                acc[date] = { date, total: 0, sources: {} };
              }
              acc[date].sources[curr.sourceName] = curr.count;
              acc[date].total += curr.count;
              return acc;
            },
            {} as Record<
              string,
              { date: string; total: number; sources: Record<string, number> }
            >
          );

          // 配列に変換してソート（昇順：古い日付→新しい日付）
          return Object.values(grouped).sort((a, b) =>
            a.date.localeCompare(b.date)
          );
        })(),
        tags: popularTags.map((tag) => ({
          id: tag.id,
          name: tag.name,
          count: tag._count.articles,
        })),
      };

      return formattedStats;
    })();

    // Store stats in cache
    await statsCache.set(cacheKey, stats);

    const responseTime = Date.now() - startTime;
    const response = NextResponse.json({
      success: true,
      data: stats,
      cache: {
        hit: false,
      },
    });

    // Add cache headers for browser caching and performance metrics
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=600'
    );
    response.headers.set('CDN-Cache-Control', 'max-age=600');
    response.headers.set('Vary', 'Accept-Encoding');
    response.headers.set('X-Cache-Status', 'MISS');
    response.headers.set('X-Response-Time', `${responseTime}ms`);

    logger.info(
      {
        route: '/api/stats',
        cacheHit: false,
        responseTime,
      },
      'Stats API cache miss - data fetched from DB'
    );

    return response;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error(
      {
        err: error as Error,
        route: '/api/stats',
        responseTime,
      },
      'Stats API error'
    );

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch statistics',
      },
      { status: 500 }
    );
  }
}
