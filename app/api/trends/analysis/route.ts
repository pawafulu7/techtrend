import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { Prisma } from '@prisma/client';
import { trendsCache } from '@/lib/cache/trends-cache';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30');
    const tagName = searchParams.get('tag');

    // キャッシュキーを生成
    const cacheKey = trendsCache.generateKey({ days, tag: tagName || undefined });
    
    // キャッシュから取得またはDBから取得してキャッシュに保存
    const analysisData = await trendsCache.getOrSet(
      cacheKey,
      async () => {
        console.log(`[Trends API] Cache miss for key: ${cacheKey} (days=${days}, tag=${tagName})`);
        
        const now = new Date();
        const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

        if (tagName) {
          // 特定タグの時系列データ
          const tagData = await prisma.$queryRaw`
            SELECT 
              TO_CHAR(a."publishedAt", 'YYYY-MM-DD') as date,
              COUNT(DISTINCT a.id) as count
            FROM "Tag" t
            JOIN "_ArticleToTag" at ON t.id = at."B"
            JOIN "Article" a ON at."A" = a.id
            WHERE t.name = ${tagName}
              AND a."publishedAt" >= ${startDate.toISOString()}::timestamp
            GROUP BY TO_CHAR(a."publishedAt", 'YYYY-MM-DD')
            ORDER BY date ASC
          ` as { date: string; count: bigint }[];

          // 関連タグを取得
          const relatedTags = await prisma.$queryRaw`
            SELECT 
              t2.name,
              COUNT(DISTINCT a.id) as count
            FROM "Tag" t1
            JOIN "_ArticleToTag" at1 ON t1.id = at1."B"
            JOIN "Article" a ON at1."A" = a.id
            JOIN "_ArticleToTag" at2 ON a.id = at2."A"
            JOIN "Tag" t2 ON at2."B" = t2.id
            WHERE t1.name = ${tagName}
              AND t2.name <> ${tagName}
              AND a."publishedAt" >= ${startDate.toISOString()}::timestamp
            GROUP BY t2.name
            ORDER BY count DESC
            LIMIT 10
          ` as { name: string; count: bigint }[];

          return {
            tag: tagName,
            timeline: tagData.map(d => ({
              date: d.date,
              count: Number(d.count)
            })),
            relatedTags: relatedTags.map(t => ({
              name: t.name,
              count: Number(t.count)
            })),
            period: {
              from: startDate.toISOString(),
              to: now.toISOString(),
              days
            }
          };
        } else {
          // 全体のトレンド分析
          const topTags = await prisma.$queryRaw`
            SELECT 
              t.name,
              COUNT(DISTINCT a.id) as total_count
            FROM "Tag" t
            JOIN "_ArticleToTag" at ON t.id = at."B"
            JOIN "Article" a ON at."A" = a.id
            WHERE a."publishedAt" >= ${startDate.toISOString()}::timestamp
            GROUP BY t.name
            ORDER BY total_count DESC
            LIMIT 10
          ` as { name: string; total_count: bigint }[];

          // 上位タグの時系列データ
          let timelineData: { date: string; tag_name: string; count: bigint }[] = [];
          
          if (topTags.length > 0) {
            const tagNames = topTags.map(t => t.name);
            timelineData = await prisma.$queryRaw`
              SELECT 
                TO_CHAR(a."publishedAt", 'YYYY-MM-DD') as date,
                t.name as tag_name,
                COUNT(DISTINCT a.id) as count
              FROM "Tag" t
              JOIN "_ArticleToTag" at ON t.id = at."B"
              JOIN "Article" a ON at."A" = a.id
              WHERE a."publishedAt" >= ${startDate.toISOString()}::timestamp
                AND t.name IN (${Prisma.join(tagNames)})
              GROUP BY TO_CHAR(a."publishedAt", 'YYYY-MM-DD'), t.name
              ORDER BY date ASC, count DESC
            ` as { date: string; tag_name: string; count: bigint }[];
          }

          // データを整形
          const timelineByDate = timelineData.reduce((acc, item) => {
            const date = item.date;
            if (!acc[date]) {
              acc[date] = {};
            }
            acc[date][item.tag_name] = Number(item.count);
            return acc;
          }, {} as Record<string, Record<string, number>>);

          // 全日付で全タグのデータを保証
          const dates = Object.keys(timelineByDate).sort();
          const tagNames = topTags.map(t => t.name);
          
          const completeTimeline = dates.map(date => {
            const dayData: Record<string, string | number> = { date };
            tagNames.forEach(tag => {
              dayData[tag] = timelineByDate[date]?.[tag] || 0;
            });
            return dayData;
          });

          return {
            topTags: topTags.map(t => ({
              name: t.name,
              totalCount: Number(t.total_count)
            })),
            timeline: completeTimeline,
            period: {
              from: startDate.toISOString(),
              to: now.toISOString(),
              days
            }
          };
        }
      }
    );

    // キャッシュ統計をログ出力
    const cacheStats = trendsCache.getStats();
    console.log('[Trends API] Cache stats:', cacheStats);

    const response = NextResponse.json({
      ...analysisData,
      cache: {
        hit: cacheStats.hits > 0,
        stats: cacheStats
      }
    });

    // キャッシュヘッダーも維持（ブラウザキャッシュ用）
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    
    return response;
  } catch (error) {
    console.error('Failed to fetch trend analysis:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trend analysis' },
      { status: 500 }
    );
  }
}