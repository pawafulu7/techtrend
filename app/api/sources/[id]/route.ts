import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Params {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const startTime = Date.now();

  try {
    const { id } = await params;

    // すべてのクエリを完全に並列化
    const [
      source,
      articles,
      recentArticles,
      topArticles,
      tagDistribution
    ] = await Promise.all([
      // ソース情報を取得
      prisma.source.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              articles: true
            }
          }
        }
      }),

      // 全記事（統計用）
      prisma.article.findMany({
        where: { sourceId: id },
        select: {
          qualityScore: true,
          publishedAt: true,
          bookmarks: true,
          userVotes: true
        }
      }),

      // 最新記事
      prisma.article.findMany({
        where: { sourceId: id },
        include: {
          tags: true
        },
        orderBy: {
          publishedAt: 'desc'
        },
        take: 10
      }),

      // 人気記事
      prisma.article.findMany({
        where: { sourceId: id },
        include: {
          tags: true
        },
        orderBy: {
          bookmarks: 'desc'
        },
        take: 5
      }),

      // タグ分布
      prisma.$queryRaw<Array<{ name: string; count: bigint }>>`
        SELECT t.name, COUNT(*) as count
        FROM Tag t
        INNER JOIN _ArticleToTag at ON t.id = at.B
        INNER JOIN Article a ON at.A = a.id
        WHERE a.sourceId = ${id}
        GROUP BY t.name
        ORDER BY count DESC
        LIMIT 20
      `
    ]);

    // ソースが見つからない場合
    if (!source) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    // 統計計算
    const totalArticles = articles.length;
    const avgQualityScore = totalArticles > 0
      ? articles.reduce((sum, a) => sum + a.qualityScore, 0) / totalArticles
      : 0;
    
    const avgBookmarks = totalArticles > 0
      ? articles.reduce((sum, a) => sum + a.bookmarks, 0) / totalArticles
      : 0;
    
    // 投稿頻度
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentArticleCount = articles.filter(
      a => a.publishedAt >= thirtyDaysAgo
    ).length;
    const publishFrequency = recentArticleCount / 30;

    // 最終投稿日
    const lastPublished = articles.length > 0
      ? Math.max(...articles.map(a => a.publishedAt.getTime()))
      : null;

    // タグ分布をオブジェクトに変換
    const tagDistributionObj = tagDistribution.reduce((acc, tag) => {
      acc[tag.name] = Number(tag.count);
      return acc;
    }, {} as Record<string, number>);

    const responseTime = Date.now() - startTime;
    const response = NextResponse.json({
      source,
      stats: {
        totalArticles,
        avgQualityScore: Math.round(avgQualityScore),
        avgBookmarks: Math.round(avgBookmarks),
        publishFrequency: Math.round(publishFrequency * 10) / 10,
        lastPublished: lastPublished ? new Date(lastPublished) : null
      },
      recentArticles,
      topArticles,
      tagDistribution: tagDistributionObj
    });

    // パフォーマンスメトリクスをヘッダーに追加
    response.headers.set('X-Response-Time', `${responseTime}ms`);
    response.headers.set('X-Query-Strategy', 'parallel');

    return response;
  } catch (error) {
    console.error('Error in sources/[id] API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}