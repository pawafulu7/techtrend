import { NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { statsCache } from '@/lib/cache/stats-cache';

export async function GET() {
  try {
    // キャッシュキーを生成
    const cacheKey = statsCache.generateKey();
    
    // キャッシュから取得またはDBから取得してキャッシュに保存
    const stats = await statsCache.getOrSet(
      cacheKey,
      async () => {
        console.log('[Stats API] Cache miss - fetching from database');
        
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
      
      // 日別統計（過去30日）
      prisma.$queryRaw`
        SELECT 
          TO_CHAR("publishedAt", 'YYYY-MM-DD') as date,
          COUNT(*)::int as count
        FROM "Article"
        WHERE "publishedAt" >= NOW() - INTERVAL '30 days'
        GROUP BY TO_CHAR("publishedAt", 'YYYY-MM-DD')
        ORDER BY date DESC
      ` as Promise<{ date: string; count: number }[]>,
      
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
          sources: sourceStats.map(source => ({
            id: source.id,
            name: source.name,
            count: source._count.articles,
            percentage: totalArticles > 0 
              ? Math.round((source._count.articles / totalArticles) * 100) 
              : 0,
          })),
          daily: dailyStats,
          tags: popularTags.map(tag => ({
            id: tag.id,
            name: tag.name,
            count: tag._count.articles,
          })),
        };

        console.log('[Stats API] Data fetched and cached successfully');
        return formattedStats;
      }
    );

    // キャッシュ統計をログ出力
    const cacheStats = statsCache.getStats();
    console.log('[Stats API] Cache stats:', cacheStats);

    return NextResponse.json({
      success: true,
      data: stats,
      cache: {
        hit: cacheStats.hits > 0,
        stats: cacheStats
      }
    });
  } catch (error) {
    console.error('Stats API error:', error);
    
    // Redisエラーの場合はフォールバックとしてDBから直接取得を試みる
    if (error instanceof Error && error.message.includes('Redis')) {
      console.warn('[Stats API] Redis error, falling back to direct DB query');
      // ここに直接DB取得のロジックを追加可能
    }
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch statistics',
      },
      { status: 500 }
    );
  }
}