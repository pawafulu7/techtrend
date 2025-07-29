import { NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

export async function GET() {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 過去24時間のタグ使用状況
    const recentTags = await prisma.$queryRaw`
      SELECT 
        t.id,
        t.name,
        COUNT(DISTINCT a.id) as recent_count
      FROM Tag t
      JOIN _ArticleToTag at ON t.id = at.B
      JOIN Article a ON at.A = a.id
      WHERE a.publishedAt >= ${oneDayAgo.getTime()}
        AND t.name != ''
        AND t.name IS NOT NULL
      GROUP BY t.id, t.name
    ` as { id: string; name: string; recent_count: bigint }[];

    // 過去1週間のタグ使用状況
    const weeklyTags = await prisma.$queryRaw`
      SELECT 
        t.id,
        t.name,
        COUNT(DISTINCT a.id) as weekly_count
      FROM Tag t
      JOIN _ArticleToTag at ON t.id = at.B
      JOIN Article a ON at.A = a.id
      WHERE a.publishedAt >= ${oneWeekAgo.getTime()}
        AND a.publishedAt < ${oneDayAgo.getTime()}
        AND t.name != ''
        AND t.name IS NOT NULL
      GROUP BY t.id, t.name
    ` as { id: string; name: string; weekly_count: bigint }[];

    // 週間平均と比較して急上昇を検出
    const weeklyTagMap = new Map(
      weeklyTags.map(tag => [tag.id, Number(tag.weekly_count) / 6]) // 6日間の平均
    );

    const trendingKeywords = recentTags
      .map(tag => {
        const recentCount = Number(tag.recent_count);
        const weeklyAverage = weeklyTagMap.get(tag.id) || 0;
        
        // 成長率を計算（ゼロ除算を避ける）
        const growthRate = weeklyAverage > 0 
          ? ((recentCount - weeklyAverage) / weeklyAverage) * 100
          : recentCount > 0 ? 100 : 0;

        return {
          id: tag.id,
          name: tag.name,
          recentCount,
          weeklyAverage: Math.round(weeklyAverage * 10) / 10,
          growthRate: Math.round(growthRate),
          isTrending: growthRate > 50 && recentCount >= 2 // 50%以上の成長かつ2件以上
        };
      })
      .filter(tag => tag.isTrending || tag.recentCount >= 3) // トレンドまたは頻出タグ
      .sort((a, b) => b.growthRate - a.growthRate)
      .slice(0, 20);

    // 新規タグ（過去24時間に初めて使われたタグ）
    const newTags = await prisma.$queryRaw`
      SELECT DISTINCT
        t.id,
        t.name,
        COUNT(DISTINCT a.id) as count
      FROM Tag t
      JOIN _ArticleToTag at ON t.id = at.B
      JOIN Article a ON at.A = a.id
      WHERE a.publishedAt >= ${oneDayAgo.getTime()}
        AND t.name != ''
        AND t.name IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 
          FROM _ArticleToTag at2
          JOIN Article a2 ON at2.A = a2.id
          WHERE at2.B = t.id 
            AND a2.publishedAt < ${oneDayAgo.getTime()}
        )
      GROUP BY t.id, t.name
      ORDER BY count DESC
      LIMIT 10
    ` as { id: string; name: string; count: bigint }[];

    return NextResponse.json({
      trending: trendingKeywords,
      newTags: newTags.map(tag => ({
        id: tag.id,
        name: tag.name,
        count: Number(tag.count)
      })),
      period: {
        from: oneDayAgo.toISOString(),
        to: now.toISOString()
      }
    });
  } catch (error) {
    console.error('Failed to fetch trending keywords:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trending keywords' },
      { status: 500 }
    );
  }
}