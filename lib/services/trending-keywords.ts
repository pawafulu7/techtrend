import { articleAggregationSql } from '@/lib/database/article-aggregation-filter';
import { findNewTags } from '@/lib/database/new-tags';
import { prisma } from '@/lib/prisma';
import { keywordsCache } from '@/lib/cache/keywords-cache';

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

async function loadTrendingKeywords() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 3クエリを並列実行
  const [recentTags, weeklyTags, newTags] = await Promise.all([
    // 過去24時間のタグ使用状況
    prisma.$queryRaw<{ id: string; name: string; recent_count: bigint }[]>`
    SELECT
      t.id,
      t.name,
      COUNT(DISTINCT a.id) as recent_count
    FROM "Tag" t
    JOIN "_ArticleToTag" at ON t.id = at."B"
    JOIN "Article" a ON at."A" = a.id
    WHERE ${articleAggregationSql('a', { from: oneDayAgo, to: now })}
      AND t.name <> ''
      AND t.name IS NOT NULL
    GROUP BY t.id, t.name
  `,
    // 過去1週間のタグ使用状況
    prisma.$queryRaw<{ id: string; name: string; weekly_count: bigint }[]>`
    SELECT
      t.id,
      t.name,
      COUNT(DISTINCT a.id) as weekly_count
    FROM "Tag" t
    JOIN "_ArticleToTag" at ON t.id = at."B"
    JOIN "Article" a ON at."A" = a.id
    WHERE ${articleAggregationSql('a', { from: oneWeekAgo, to: oneDayAgo })}
      AND t.name <> ''
      AND t.name IS NOT NULL
    GROUP BY t.id, t.name
  `,
    // 新規タグ（過去24時間に初めて使われたタグ）
    findNewTags(prisma, { from: oneDayAgo, to: now, limit: 10 }),
  ]);

  // 週間平均と比較して急上昇を検出
  const weeklyTagMap = new Map(
    weeklyTags.map((tag) => [tag.id, Number(tag.weekly_count) / 6]) // 6日間の平均
  );

  const trendingKeywords = recentTags
    .map((tag) => {
      const recentCount = Number(tag.recent_count);
      const weeklyAverage = weeklyTagMap.get(tag.id) || 0;

      // weeklyAverage（日平均）の最低値を1.0に設定（極小分母による膨張を防止）
      // weeklyAverage=0 も含め、1.0未満は全て1.0に統一（不連続回避）
      const effectiveAverage = Math.max(weeklyAverage, 1.0);
      const rawGrowthRate =
        ((recentCount - effectiveAverage) / effectiveAverage) * 100;
      // 成長率を999%にキャップ
      const growthRate = Math.min(Math.round(rawGrowthRate), 999);

      return {
        id: tag.id,
        name: tag.name,
        recentCount,
        weeklyAverage: Math.round(weeklyAverage * 10) / 10,
        growthRate,
        isTrending: growthRate > 50 && recentCount >= 2, // 50%以上の成長かつ2件以上
      };
    })
    .filter((tag) => tag.isTrending || tag.recentCount >= 3) // トレンドまたは頻出タグ
    .sort(
      (a, b) => b.growthRate - a.growthRate || b.recentCount - a.recentCount
    )
    .slice(0, 20);

  return {
    trending: trendingKeywords,
    newTags: newTags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      count: tag.count,
    })),
    period: {
      from: oneDayAgo.toISOString(),
      to: now.toISOString(),
    },
  };
}

export function getTrendingKeywords() {
  return keywordsCache.getOrSetWithLock(
    'keywords:trending:v2',
    loadTrendingKeywords
  );
}
