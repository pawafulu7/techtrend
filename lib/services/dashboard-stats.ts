import { prisma } from '@/lib/prisma';
import { RedisCache } from '@/lib/cache';
import {
  enabledSourceSql,
  enabledSourceWhere,
} from '@/lib/database/enabled-source-filter';
import { findTopTags } from '@/lib/database/tag-article-counts';

const statsCache = new RedisCache({
  ttl: 300,
  namespace: '@techtrend/cache:stats:v2',
});

async function loadDashboardStats() {
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
    prisma.article.count({ where: { AND: [enabledSourceWhere()] } }),

    // 過去7日間の記事数
    prisma.article.count({
      where: {
        publishedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
        AND: [enabledSourceWhere()],
      },
    }),

    // 過去30日間の記事数
    prisma.article.count({
      where: {
        publishedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
        AND: [enabledSourceWhere()],
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
    prisma.$queryRaw<{ date: string; sourceName: string; count: number }[]>`
    SELECT
      TO_CHAR(a."publishedAt", 'YYYY-MM-DD') as date,
      s.name as "sourceName",
      COUNT(*)::int as count
    FROM "Article" a
    JOIN "Source" s ON a."sourceId" = s.id
    WHERE a."publishedAt" >= NOW() - INTERVAL '30 days'
      AND ${enabledSourceSql()}
    GROUP BY TO_CHAR(a."publishedAt", 'YYYY-MM-DD'), s.name
    ORDER BY date DESC, count DESC
  `,

    // 人気タグTOP10
    findTopTags(prisma, { limit: 10 }),
  ]);

  // レスポンスデータを整形
  const formattedStats = {
    // 集計した時刻。画面に集計時刻として出す（issue #707）
    generatedAt: new Date().toISOString(),
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
      count: tag.count,
    })),
  };

  return formattedStats;
}

export function getDashboardStats() {
  return statsCache.getOrSetWithLockWithMeta(
    'stats:dashboard:v2',
    loadDashboardStats
  );
}
