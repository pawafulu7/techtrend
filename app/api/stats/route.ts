import { NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

export async function GET() {
  try {
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
          DATE(publishedAt) as date,
          COUNT(*) as count
        FROM Article
        WHERE publishedAt >= datetime('now', '-30 days')
        GROUP BY DATE(publishedAt)
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
    const stats = {
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

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch statistics',
      },
      { status: 500 }
    );
  }
}