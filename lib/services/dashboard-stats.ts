import { prisma } from '@/lib/prisma';
import { RedisCache } from '@/lib/cache';
import {
  enabledSourceSql,
  enabledSourceWhere,
} from '@/lib/database/enabled-source-filter';
import {
  daysAgo,
  publishedAtPeriodSql,
} from '@/lib/database/article-aggregation-filter';
import { findTopTags } from '@/lib/database/tag-article-counts';

const statsCache = new RedisCache({
  ttl: 300,
  namespace: '@techtrend/cache:stats:v2',
});

/**
 * 公開日時が [from, to) の記事数（有効なソースの記事だけ。非表示の記事も、このページのほかの件数と同じく数える）。
 * Prisma の count に Date を渡すと、pg アダプターがオフセット無しで送り、セッションのタイムゾーンが UTC でないと
 * 時差の分ずれるので、期間は publishedAtPeriodSql（ISO 文字列を ::timestamptz で読む）で書く
 */
async function countPublishedBetween(from: Date, to: Date): Promise<number> {
  const [{ count }] = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int as count
    FROM "Article" a
    WHERE ${publishedAtPeriodSql('a', { from, to })}
      AND ${enabledSourceSql()}
  `;
  return count;
}

async function loadDashboardStats() {
  // 期間は [N 日前, now)。上限を付け、公開日時が未来の記事を数えない
  const now = new Date();

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
    countPublishedBetween(daysAgo(7, now), now),

    // 過去30日間の記事数
    countPublishedBetween(daysAgo(30, now), now),

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

    // 日別統計（過去30日）- ソース別内訳付き。日付は日本時間の暦日（トレンドの分析と同じ区切り）
    prisma.$queryRaw<{ date: string; sourceName: string; count: number }[]>`
    SELECT
      TO_CHAR(a."publishedAt" AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') as date,
      s.name as "sourceName",
      COUNT(*)::int as count
    FROM "Article" a
    JOIN "Source" s ON a."sourceId" = s.id
    WHERE ${publishedAtPeriodSql('a', { from: daysAgo(30, now), to: now })}
      AND ${enabledSourceSql()}
    GROUP BY 1, s.name
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
