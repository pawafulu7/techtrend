import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { keywordsCache } from '@/lib/cache/keywords-cache';
import { trendsCache } from '@/lib/cache/trends-cache';
import { RedisCache } from '@/lib/cache';

// 読み取り専用: キャッシュへの書き込みは /api/stats ルートが担当
const statsCache = new RedisCache({
  ttl: 300,
  namespace: '@techtrend/cache:stats:v2',
});

export interface TrendingKeyword {
  id: string;
  name: string;
  recentCount: number;
  weeklyAverage: number;
  growthRate: number;
  isTrending: boolean;
}

export interface NewTag {
  id: string;
  name: string;
  count: number;
}

export interface TrendAnalysis {
  topTags: { name: string; totalCount: number }[];
  timeline: Array<{
    date: string;
    [key: string]: string | number;
  }>;
  period: {
    from: string;
    to: string;
    days: number;
  };
}

export interface SourceDataItem {
  name: string;
  value: number;
  percentage: number;
}

export async function fetchKeywordsData(): Promise<{
  trending: TrendingKeyword[];
  newTags: NewTag[];
}> {
  try {
    const cacheKey = 'keywords:trending';

    // キャッシュ読み取りのみ。書き込みは /api/trends/keywords ルートが担当。
    // APIルートは { trending, newTags, period } を書き込むため、
    // SC側が { trending, newTags } のみを書き込むとpayload不一致が発生する。
    type KeywordsPayload = {
      trending: TrendingKeyword[];
      newTags: NewTag[];
    };
    const cached = await keywordsCache.get<KeywordsPayload>(cacheKey);
    if (cached) {
      return {
        trending: cached.trending || [],
        newTags: cached.newTags || [],
      };
    }

    // キャッシュミス時はDBから直接フェッチ（キャッシュへの書き込みなし）
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [recentTags, weeklyTags, newTagsRaw] = await Promise.all([
      prisma.$queryRaw`
          SELECT
            t.id,
            t.name,
            COUNT(DISTINCT a.id) as recent_count
          FROM "Tag" t
          JOIN "_ArticleToTag" at ON t.id = at."B"
          JOIN "Article" a ON at."A" = a.id
          WHERE a."publishedAt" >= ${oneDayAgo.toISOString()}::timestamptz
            AND a."isHidden" = false
            AND t.name <> ''
            AND t.name IS NOT NULL
          GROUP BY t.id, t.name
        ` as Promise<{ id: string; name: string; recent_count: bigint }[]>,

      prisma.$queryRaw`
          SELECT
            t.id,
            t.name,
            COUNT(DISTINCT a.id) as weekly_count
          FROM "Tag" t
          JOIN "_ArticleToTag" at ON t.id = at."B"
          JOIN "Article" a ON at."A" = a.id
          WHERE a."publishedAt" >= ${oneWeekAgo.toISOString()}::timestamptz
            AND a."publishedAt" < ${oneDayAgo.toISOString()}::timestamptz
            AND a."isHidden" = false
            AND t.name <> ''
            AND t.name IS NOT NULL
          GROUP BY t.id, t.name
        ` as Promise<{ id: string; name: string; weekly_count: bigint }[]>,

      prisma.$queryRaw`
          SELECT DISTINCT
            t.id,
            t.name,
            COUNT(DISTINCT a.id) as count
          FROM "Tag" t
          JOIN "_ArticleToTag" at ON t.id = at."B"
          JOIN "Article" a ON at."A" = a.id
          WHERE a."publishedAt" >= ${oneDayAgo.toISOString()}::timestamptz
            AND a."isHidden" = false
            AND t.name <> ''
            AND t.name IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM "_ArticleToTag" at2
              JOIN "Article" a2 ON at2."A" = a2.id
              WHERE at2."B" = t.id
                AND a2."publishedAt" < ${oneDayAgo.toISOString()}::timestamptz
                AND a2."isHidden" = false
            )
          GROUP BY t.id, t.name
          ORDER BY count DESC
          LIMIT 10
        ` as Promise<{ id: string; name: string; count: bigint }[]>,
    ]);

    const weeklyTagMap = new Map(
      weeklyTags.map((tag) => [tag.id, Number(tag.weekly_count) / 6])
    );

    const trendingKeywords = recentTags
      .map((tag) => {
        const recentCount = Number(tag.recent_count);
        const weeklyAverage = weeklyTagMap.get(tag.id) || 0;
        const effectiveAverage = Math.max(weeklyAverage, 1.0);
        const rawGrowthRate =
          ((recentCount - effectiveAverage) / effectiveAverage) * 100;
        const growthRate = Math.min(Math.round(rawGrowthRate), 999);

        return {
          id: tag.id,
          name: tag.name,
          recentCount,
          weeklyAverage: Math.round(weeklyAverage * 10) / 10,
          growthRate,
          isTrending: growthRate > 50 && recentCount >= 2,
        };
      })
      .filter((tag) => tag.isTrending || tag.recentCount >= 3)
      .sort(
        (a, b) => b.growthRate - a.growthRate || b.recentCount - a.recentCount
      )
      .slice(0, 20);

    return {
      trending: trendingKeywords,
      newTags: newTagsRaw.map((tag) => ({
        id: tag.id,
        name: tag.name,
        count: Number(tag.count),
      })),
    };
  } catch {
    return { trending: [], newTags: [] };
  }
}

export async function fetchAnalysisData(
  days: number
): Promise<TrendAnalysis | null> {
  try {
    const cacheKey = trendsCache.generateTrendsKey({ days });
    const analysisData = await trendsCache.getOrSet(cacheKey, async () => {
      const now = new Date();
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      const topTags = (await prisma.$queryRaw`
        SELECT
          t.name,
          COUNT(DISTINCT a.id) as total_count
        FROM "Tag" t
        JOIN "_ArticleToTag" at ON t.id = at."B"
        JOIN "Article" a ON at."A" = a.id
        WHERE a."publishedAt" >= ${startDate.toISOString()}::timestamp
          AND a."isHidden" = false
        GROUP BY t.name
        ORDER BY total_count DESC
        LIMIT 10
      `) as { name: string; total_count: bigint }[];

      let timelineData: { date: string; tag_name: string; count: bigint }[] =
        [];

      if (topTags.length > 0) {
        const tagNames = topTags.map((t) => t.name);
        timelineData = (await prisma.$queryRaw`
          SELECT
            TO_CHAR(a."publishedAt", 'YYYY-MM-DD') as date,
            t.name as tag_name,
            COUNT(DISTINCT a.id) as count
          FROM "Tag" t
          JOIN "_ArticleToTag" at ON t.id = at."B"
          JOIN "Article" a ON at."A" = a.id
          WHERE a."publishedAt" >= ${startDate.toISOString()}::timestamp
            AND a."isHidden" = false
            AND t.name IN (${Prisma.join(tagNames)})
          GROUP BY TO_CHAR(a."publishedAt", 'YYYY-MM-DD'), t.name
          ORDER BY date ASC, count DESC
        `) as { date: string; tag_name: string; count: bigint }[];
      }

      const timelineByDate = timelineData.reduce(
        (acc, item) => {
          const date = item.date;
          if (!acc[date]) acc[date] = {};
          acc[date][item.tag_name] = Number(item.count);
          return acc;
        },
        {} as Record<string, Record<string, number>>
      );

      const dates = Object.keys(timelineByDate).sort();
      const tagNames = topTags.map((t) => t.name);

      const completeTimeline = dates.map((date) => {
        const dayData: Record<string, string | number> = { date };
        tagNames.forEach((tag) => {
          dayData[tag] = timelineByDate[date]?.[tag] || 0;
        });
        return dayData;
      });

      return {
        topTags: topTags.map((t) => ({
          name: t.name,
          totalCount: Number(t.total_count),
        })),
        timeline: completeTimeline,
        period: {
          from: startDate.toISOString(),
          to: now.toISOString(),
          days,
        },
      };
    });

    return analysisData as TrendAnalysis;
  } catch {
    return null;
  }
}

export async function fetchSourceData(): Promise<SourceDataItem[]> {
  try {
    const cacheKey = 'stats:dashboard:v2';

    type StatsPayload = {
      sources: {
        id: string;
        name: string;
        count: number;
        percentage: number;
      }[];
    };

    const cachedStats = await statsCache.get<StatsPayload>(cacheKey);
    const sourcesRaw = cachedStats
      ? cachedStats.sources
      : await (async () => {
          const [totalArticles, sourceStats] = await Promise.all([
            prisma.article.count(),
            prisma.source.findMany({
              where: { enabled: true },
              include: { _count: { select: { articles: true } } },
              orderBy: { articles: { _count: 'desc' } },
            }),
          ]);

          const sources = sourceStats.map((source) => ({
            id: source.id,
            name: source.name,
            count: source._count.articles,
            percentage:
              totalArticles > 0
                ? Math.round((source._count.articles / totalArticles) * 1000) /
                  10
                : 0,
          }));

          return sources;
        })();

    const topSources = sourcesRaw.slice(0, 6);
    const otherSources = sourcesRaw.slice(6);

    const othersCount = otherSources.reduce(
      (sum, source) => sum + source.count,
      0
    );
    const othersPercentage = otherSources.reduce(
      (sum, source) => sum + source.percentage,
      0
    );

    const sourceData: SourceDataItem[] = topSources.map((source) => ({
      name: source.name,
      value: source.count,
      percentage: source.percentage,
    }));

    if (othersCount > 0) {
      sourceData.push({
        name: 'その他',
        value: othersCount,
        percentage: othersPercentage,
      });
    }

    return sourceData;
  } catch {
    return [];
  }
}
