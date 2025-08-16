import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { popularCache, type PopularPeriod } from '@/lib/cache/popular-cache';
import type { ArticleWithRelations } from '@/types/models';
import type { ApiResponse } from '@/types/api';

type Period = 'today' | 'week' | 'month' | 'all';
type Metric = 'bookmarks' | 'votes' | 'quality' | 'combined';

// 前回ランキング用のキャッシュ（トレンド計算用）
interface CachedData {
  data: unknown;
  timestamp: number;
}
const trendCache = new Map<string, CachedData>();

// トレンド計算関数
function calculateTrend(currentRank: number, articleId: string, previousRankings: unknown): 'up' | 'down' | 'stable' | 'new' {
  if (!previousRankings || !Array.isArray(previousRankings)) return 'new';
  
  const previousItem = previousRankings.find(item => item.id === articleId);
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

// カテゴリからソースIDを取得
async function getSourceIdFromCategory(category: string): Promise<string | undefined> {
  const source = await prisma.source.findFirst({
    where: { name: category }
  });
  return source?.id;
}

// カテゴリからタグIDを取得
async function getTagIdFromCategory(category: string): Promise<string | undefined> {
  const tag = await prisma.tag.findFirst({
    where: { name: category }
  });
  return tag?.id;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const period = (searchParams.get('period') || 'week') as Period;
    const metric = (searchParams.get('metric') || 'combined') as Metric;
    const category = searchParams.get('category');
    const limit = parseInt(searchParams.get('limit') || '20');

    // PopularCacheを使用
    const popularPeriod = mapPeriodToPopular(period);
    
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

        // カテゴリーフィルター
        let categoryFilter = {};
        if (category) {
          // タグかソースかを判定
          const tag = await prisma.tag.findFirst({
            where: { name: category }
          });
          
          if (tag) {
            categoryFilter = {
              tags: { some: { name: category } }
            };
          } else {
            categoryFilter = {
              source: { name: category }
            };
          }
        }

        // 記事取得
        const articles = await prisma.article.findMany({
          where: {
            ...dateFilter,
            ...categoryFilter,
            qualityScore: { gte: 30 } // 品質フィルター
          },
          include: {
            source: true,
            tags: true
          },
          take: limit * 2 // スコア計算後にカットするため多めに取得
        });

        // スコア計算とソート
        const scoredArticles = articles.map(article => {
          let score = 0;
          
          switch (metric) {
            case 'bookmarks':
              score = article.bookmarks;
              break;
            case 'votes':
              score = article.userVotes || 0;
              break;
            case 'quality':
              score = article.qualityScore;
              break;
            case 'combined':
              // 総合スコア計算
              const bookmarkWeight = 0.3;
              const voteWeight = 0.2;
              const qualityWeight = 0.3;
              const recencyWeight = 0.2;
              
              const ageInDays = (Date.now() - article.publishedAt.getTime()) / (1000 * 60 * 60 * 24);
              const recencyScore = Math.exp(-ageInDays / 7);
              
              score = 
                article.bookmarks * bookmarkWeight +
                (article.userVotes || 0) * voteWeight +
                article.qualityScore * qualityWeight +
                recencyScore * 100 * recencyWeight;
              break;
          }
          
          return { ...article, score };
        });

        // ソートして上位を取得
        scoredArticles.sort((a, b) => b.score - a.score);
        const topArticles = scoredArticles.slice(0, limit);

        // 前回のランキングを取得
        const rankCacheKey = `rankings_${period}_${metric}_${category || 'all'}`;
        const previousRankings = trendCache.get(rankCacheKey)?.data;
        
        // ランキング情報を付与
        const rankedArticles = topArticles.map((article, index) => {
          const currentRank = index + 1;
          const trend = calculateTrend(currentRank, article.id, previousRankings);
          
          return {
            ...article,
            rank: currentRank,
            trend
          };
        });

        const response = {
          articles: rankedArticles,
          period,
          metric,
          timestamp: new Date().toISOString()
        };

        // 現在のランキングをトレンドキャッシュに保存
        trendCache.set(rankCacheKey, {
          data: rankedArticles,
          timestamp: Date.now()
        });
        
        return response;
      },
      {
        limit,
        sourceId: category ? await getSourceIdFromCategory(category) : undefined,
        tagId: category ? await getTagIdFromCategory(category) : undefined
      }
    );
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Popular articles error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}