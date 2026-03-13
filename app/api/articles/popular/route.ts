import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { prisma } from '@/lib/database';
import { popularCache, type PopularPeriod } from '@/lib/cache/popular-cache';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';

const boolParam = (defaultVal: 'true' | 'false' = 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultVal)
    .transform((v) => v === 'true');

const querySchema = z.object({
  period: z.enum(['today', 'week', 'month', 'all']).default('week'),
  metric: z
    .enum(['bookmarks', 'votes', 'quality', 'combined'])
    .default('combined'),
  category: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  includeEmptyContent: boolParam(),
  excludeUnprocessed: boolParam(),
  excludeLowQuality: boolParam(),
});

type ParsedQuery = z.infer<typeof querySchema>;
type Period = ParsedQuery['period'];
type Metric = ParsedQuery['metric'];

// 前回ランキング用のキャッシュ（トレンド計算用）
interface CachedData {
  data: unknown;
  timestamp: number;
}
const trendCache = new Map<string, CachedData>();
const TREND_CACHE_TTL_MS = 5 * 60 * 1000;

function getTrendCache(key: string) {
  const cached = trendCache.get(key);
  if (!cached) return undefined;
  if (Date.now() - cached.timestamp > TREND_CACHE_TTL_MS) {
    trendCache.delete(key);
    return undefined;
  }
  return cached.data;
}

function pruneTrendCache() {
  const now = Date.now();
  for (const [key, value] of trendCache) {
    if (now - value.timestamp > TREND_CACHE_TTL_MS) {
      trendCache.delete(key);
    }
  }
}

// トレンド計算関数
function calculateTrend(
  currentRank: number,
  articleId: string,
  previousRankings: unknown
): 'up' | 'down' | 'stable' | 'new' {
  if (!previousRankings || !Array.isArray(previousRankings)) return 'new';

  const previousItem = previousRankings.find((item) => item.id === articleId);
  if (!previousItem) return 'new';

  const rankDiff = previousItem.rank - currentRank;
  if (rankDiff > 0) return 'up';
  if (rankDiff < 0) return 'down';
  return 'stable';
}

// Periodを PopularPeriodにマップ
function mapPeriodToPopular(period: Period): PopularPeriod {
  switch (period) {
    case 'today':
      return 'daily';
    case 'week':
      return 'weekly';
    case 'month':
      return 'monthly';
    case 'all':
      return 'yearly';
    default:
      return 'weekly';
  }
}

// カテゴリからタグIDを取得
async function getTagIdFromCategory(
  category: string
): Promise<string | undefined> {
  const tag = await prisma.tag.findFirst({
    where: { name: category },
  });
  return tag?.id;
}

async function getPopularArticles(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const {
      period,
      metric,
      category,
      limit,
      includeEmptyContent,
      excludeUnprocessed,
      excludeLowQuality,
    } = querySchema.parse(Object.fromEntries(searchParams));

    // PopularCacheを使用
    const popularPeriod = mapPeriodToPopular(period);

    // カテゴリのタグIDを事前に取得（キャッシュキー生成とタグ/ソース判定に使用）
    const resolvedTagId = category
      ? await getTagIdFromCategory(category)
      : undefined;
    // ソースIDはフィルタに不要。キャッシュキーにはカテゴリ名を使用
    const sourceCacheKey =
      category && !resolvedTagId
        ? `name:${encodeURIComponent(category)}`
        : undefined;

    const result = await popularCache.getOrSet(
      popularPeriod,
      async () => {
        // 期間フィルター
        let dateFilter = {};
        const now = new Date();
        switch (period) {
          case 'today':
            const todayStart = new Date(now);
            todayStart.setHours(0, 0, 0, 0);
            dateFilter = { publishedAt: { gte: todayStart } };
            break;
          case 'week':
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            dateFilter = { publishedAt: { gte: weekAgo } };
            break;
          case 'month':
            const monthAgo = new Date(now);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            dateFilter = { publishedAt: { gte: monthAgo } };
            break;
        }

        // カテゴリーフィルター（事前取得結果を使用、追加クエリなし）
        let categoryFilter = {};
        if (category) {
          if (resolvedTagId) {
            categoryFilter = {
              tags: { some: { name: category } },
            };
          } else {
            categoryFilter = {
              source: { name: category },
            };
          }
        }

        // コンテンツフィルターの条件設定
        const contentFilter = includeEmptyContent
          ? {}
          : {
              AND: [{ content: { not: null } }, { content: { not: '' } }],
            };

        // 処理済み記事フィルターの条件設定
        const processedFilter = excludeUnprocessed
          ? { summaryComputedAt: { not: null } }
          : {};

        // Low quality filters (conditional based on excludeLowQuality parameter)
        // skipReason filter: Exclude THIN_CONTENT and QUALITY_FAILED, but allow PDF and SLIDE
        const skipReasonFilter = excludeLowQuality
          ? {
              OR: [
                { skipReason: null },
                {
                  skipReason: {
                    notIn: ['THIN_CONTENT' as const, 'QUALITY_FAILED' as const],
                  },
                },
              ],
            }
          : {};

        // qualityScore filter: Exclude < 30
        // Note: qualityScore is Float @default(0), so null is not possible
        const qualityScoreFilter = excludeLowQuality
          ? { qualityScore: { gte: 30 } }
          : {};

        // metric別のDB側orderByとtakeを決定
        // 単一フィールドmetricはDB側ソートで正確な結果が得られるためtake: limitで十分
        // combinedは複合スコア計算が必要なため多めに取得
        const metricOrderMap: Partial<
          Record<Metric, { [key: string]: 'desc' }[]>
        > = {
          bookmarks: [
            { bookmarks: 'desc' },
            { publishedAt: 'desc' },
            { id: 'desc' },
          ],
          votes: [
            { userVotes: 'desc' },
            { publishedAt: 'desc' },
            { id: 'desc' },
          ],
          quality: [
            { qualityScore: 'desc' },
            { publishedAt: 'desc' },
            { id: 'desc' },
          ],
        };
        const dbOrderBy = metricOrderMap[metric];
        const dbTake = dbOrderBy ? limit : undefined;

        // 記事取得
        const articles = await prisma.article.findMany({
          where: {
            AND: [
              dateFilter,
              categoryFilter,
              qualityScoreFilter,
              contentFilter,
              processedFilter,
              skipReasonFilter,
            ].filter((f) => Object.keys(f).length > 0), // Remove empty filters
          },
          omit: {
            content: true,
            detailedSummary: true,
          },
          include: {
            source: true,
            tags: true,
          },
          ...(dbOrderBy && { orderBy: dbOrderBy }),
          ...(dbTake != null && { take: dbTake }),
        });

        // スコア計算とソート
        const scoredArticles = articles.map((article) => {
          let score = 0;

          switch (metric) {
            case 'bookmarks':
              score = article.bookmarks ?? 0;
              break;
            case 'votes':
              score = article.userVotes || 0;
              break;
            case 'quality':
              score = article.qualityScore ?? 0;
              break;
            case 'combined':
              // 総合スコア計算
              const bookmarkWeight = 0.3;
              const voteWeight = 0.2;
              const qualityWeight = 0.3;
              const recencyWeight = 0.2;

              const ageInDays =
                (Date.now() - article.publishedAt.getTime()) /
                (1000 * 60 * 60 * 24);
              const recencyScore = Math.exp(-ageInDays / 7);

              score =
                (article.bookmarks ?? 0) * bookmarkWeight +
                (article.userVotes || 0) * voteWeight +
                (article.qualityScore ?? 0) * qualityWeight +
                recencyScore * 100 * recencyWeight;
              break;
          }

          return { ...article, score };
        });

        // ソートして上位を取得
        // 単一フィールドmetricはDB側orderByで既にソート済みのためスキップ
        if (!dbOrderBy) {
          scoredArticles.sort((a, b) => b.score - a.score);
        }
        const topArticles = scoredArticles.slice(0, limit);

        // 前回のランキングを取得（フィルタ条件を含むキーで正確なtrend比較を保証）
        const rankCacheKey = `rankings:${popularCache.generateKey(
          popularPeriod,
          {
            limit,
            sourceId: sourceCacheKey,
            tagId: resolvedTagId,
            metric,
            includeEmptyContent,
            excludeUnprocessed,
            excludeLowQuality,
          }
        )}`;
        const previousRankings = getTrendCache(rankCacheKey);

        // ランキング情報を付与
        const rankedArticles = topArticles.map((article, index) => {
          const currentRank = index + 1;
          const trend = calculateTrend(
            currentRank,
            article.id,
            previousRankings
          );

          return {
            ...article,
            rank: currentRank,
            trend,
          };
        });

        const response = {
          articles: rankedArticles,
          period,
          metric,
          timestamp: new Date().toISOString(),
        };

        // 現在のランキングをトレンドキャッシュに保存
        pruneTrendCache();
        trendCache.set(rankCacheKey, {
          data: rankedArticles,
          timestamp: Date.now(),
        });

        return response;
      },
      {
        limit,
        sourceId: sourceCacheKey,
        tagId: resolvedTagId,
        metric,
        includeEmptyContent,
        excludeUnprocessed,
        excludeLowQuality,
      }
    );

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}

export const GET = withRateLimit('read:popular', getPopularArticles);
