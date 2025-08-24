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
          sources: sourceStats.map(source => ({
            id: source.id,
            name: source.name,
            count: source._count.articles,
            percentage: totalArticles > 0 
              ? Math.round((source._count.articles / totalArticles) * 100) 
              : 0,
          })),
          daily: (() => {
            // 日付ごとにグループ化してソース別内訳を集計
            const grouped = dailyStats.reduce((acc, curr) => {
              const date = curr.date;
              if (!acc[date]) {
                acc[date] = { date, total: 0, sources: {} };
              }
              acc[date].sources[curr.sourceName] = curr.count;
              acc[date].total += curr.count;
              return acc;
            }, {} as Record<string, { date: string; total: number; sources: Record<string, number> }>);
            
            // 配列に変換してソート
            return Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));
          })(),
          tags: popularTags.map(tag => ({
            id: tag.id,
            name: tag.name,
            count: tag._count.articles,
          })),
        };

        return formattedStats;
      }
    );

    // キャッシュ統計をログ出力
    const cacheStats = statsCache.getStats();

    return NextResponse.json({
      success: true,
      data: stats,
      cache: {
        hit: cacheStats.hits > 0,
        stats: cacheStats
      }
    });
  } catch (error) {
    
    // Redisエラーの場合はフォールバックとしてDBから直接取得を試みる
    if (error instanceof Error && error.message.includes('Redis')) {
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