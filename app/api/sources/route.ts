import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { RedisCache } from '@/lib/cache';

const prisma = new PrismaClient();

// Initialize Redis cache with 1 hour TTL for sources
const cache = new RedisCache({
  ttl: 3600, // 1 hour
  namespace: '@techtrend/cache:api'
});

type SourceCategory = 'tech_blog' | 'company_blog' | 'personal_blog' | 'news_site' | 'community' | 'other';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  let cacheStatus = 'MISS';
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') as SourceCategory | null;
    const sortBy = searchParams.get('sortBy') || 'articles';
    const order = searchParams.get('order') || 'desc';
    const search = searchParams.get('search');
    const ids = searchParams.get('ids');
    
    // Generate cache key based on query parameters
    const cacheKey = cache.generateCacheKey('sources', {
      params: {
        category: category || 'all',
        sortBy,
        order,
        search: search || 'none',
        ids: ids || 'all'
      }
    });

    // Try to get from cache or fetch fresh data
    const result = await cache.getOrSet(cacheKey, async () => {
      cacheStatus = 'MISS';
      
      // 基本的なソース情報を取得
      const sources = await prisma.source.findMany({
      where: {
        enabled: true,
        ...(ids && {
          id: {
            in: ids.split(',')
          }
        }),
        ...(search && {
          name: {
            contains: search,
            mode: 'insensitive'
          }
        })
      },
      include: {
        _count: {
          select: {
            articles: true
          }
        },
        articles: {
          select: {
            qualityScore: true,
            publishedAt: true,
            tags: {
              select: {
                name: true
              }
            }
          },
          orderBy: {
            publishedAt: 'desc'
          }
        }
      }
    });

    // 統計情報を計算
    const sourcesWithStats = sources.map(source => {
      const articles = source.articles;
      const totalArticles = source._count.articles;

      // 品質スコアの平均
      const avgQualityScore = totalArticles > 0
        ? articles.reduce((sum, a) => sum + a.qualityScore, 0) / totalArticles
        : 0;

      // 人気タグの集計
      const tagCounts: Record<string, number> = {};
      articles.forEach(article => {
        article.tags.forEach(tag => {
          tagCounts[tag.name] = (tagCounts[tag.name] || 0) + 1;
        });
      });
      const popularTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag]) => tag);

      // 最終投稿日
      const lastPublished = articles.length > 0
        ? articles[0].publishedAt
        : null;

      // 投稿頻度（過去30日間の記事数から計算）
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentArticles = articles.filter(
        a => a.publishedAt >= thirtyDaysAgo
      );
      const publishFrequency = recentArticles.length / 30;
      
      // 成長率計算: 過去30日と過去60-30日の比較
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      
      const pastMonthArticles = articles.filter(
        a => a.publishedAt >= sixtyDaysAgo && a.publishedAt < thirtyDaysAgo
      );
      
      const currentMonthCount = recentArticles.length;
      const pastMonthCount = pastMonthArticles.length;
      const growthRate = pastMonthCount > 0 
        ? Math.round(((currentMonthCount - pastMonthCount) / pastMonthCount) * 100)
        : currentMonthCount > 0 ? 100 : 0;

      // カテゴリー推定（簡易版）
      let category: SourceCategory = 'other';
      const nameLower = source.name.toLowerCase();
      if (nameLower.includes('blog')) {
        if (nameLower.includes('company') || nameLower.includes('tech')) {
          category = 'company_blog';
        } else {
          category = 'personal_blog';
        }
      } else if (nameLower.includes('news')) {
        category = 'news_site';
      } else if (['qiita', 'zenn', 'dev.to', 'reddit'].some(c => nameLower.includes(c))) {
        category = 'community';
      } else if (['techcrunch', 'hacker news'].some(c => nameLower.includes(c))) {
        category = 'news_site';
      }

      return {
        id: source.id,
        name: source.name,
        type: source.type,
        url: source.url,
        enabled: source.enabled,
        category,
        stats: {
          totalArticles,
          avgQualityScore: Math.round(avgQualityScore),
          popularTags,
          publishFrequency: Math.round(publishFrequency * 10) / 10,
          lastPublished,
          growthRate
        }
      };
    });

    // カテゴリーフィルタリング
    let filteredSources = sourcesWithStats;
    if (category) {
      filteredSources = filteredSources.filter(s => s.category === category);
    }

    // ソート
      filteredSources.sort((a, b) => {
        let aValue, bValue;
        switch (sortBy) {
          case 'articles':
            aValue = a.stats.totalArticles;
            bValue = b.stats.totalArticles;
            break;
          case 'quality':
            aValue = a.stats.avgQualityScore;
            bValue = b.stats.avgQualityScore;
            break;
          case 'frequency':
            aValue = a.stats.publishFrequency;
            bValue = b.stats.publishFrequency;
            break;
          case 'name':
            aValue = a.name;
            bValue = b.name;
            break;
          default:
            aValue = a.stats.totalArticles;
            bValue = b.stats.totalArticles;
        }

        if (sortBy === 'name') {
          return order === 'asc' 
            ? (aValue as string).localeCompare(bValue as string)
            : (bValue as string).localeCompare(aValue as string);
        } else {
          return order === 'asc' 
            ? (aValue as number) - (bValue as number)
            : (bValue as number) - (aValue as number);
        }
      });

      // Return the data to be cached
      return {
        sources: filteredSources,
        totalCount: filteredSources.length
      };
    });
    
    // If we got data from cache, update status
    if (result && cacheStatus !== 'MISS') {
      cacheStatus = 'HIT';
    }
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Create response with performance headers
    const response = NextResponse.json(result);
    response.headers.set('X-Cache-Status', cacheStatus);
    response.headers.set('X-Response-Time', `${responseTime}ms`);
    
    return response;
  } catch (error) {
    console.error('Sources error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}