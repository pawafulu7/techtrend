import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sourceIds = searchParams.get('sourceIds');
    const page = Math.min(
      1000,
      Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    );
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20)
    );

    if (!sourceIds) {
      return NextResponse.json(
        { error: 'sourceIds parameter is required' },
        { status: 400 }
      );
    }

    const sourceIdArray = sourceIds.split(',');
    const skip = (page - 1) * limit;

    // お気に入りソースからの記事を取得
    const [articles, totalCount] = await Promise.all([
      prisma.article.findMany({
        where: {
          sourceId: {
            in: sourceIdArray,
          },
        },
        include: {
          source: true,
          tags: true,
        },
        orderBy: {
          publishedAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.article.count({
        where: {
          sourceId: {
            in: sourceIdArray,
          },
        },
      }),
    ]);

    // ArticleWithRelations形式に変換
    const articlesWithRelations = articles.map((article) => ({
      ...article,
      tags: article.tags.map((tag) => tag.name),
    }));

    return NextResponse.json({
      articles: articlesWithRelations,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
