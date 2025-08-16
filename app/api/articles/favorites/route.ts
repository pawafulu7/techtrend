import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sourceIds = searchParams.get('sourceIds');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const folder = searchParams.get('folder');
    
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
            in: sourceIdArray
          }
        },
        include: {
          source: true,
          tags: true,
        },
        orderBy: {
          publishedAt: 'desc'
        },
        skip,
        take: limit
      }),
      prisma.article.count({
        where: {
          sourceId: {
            in: sourceIdArray
          }
        }
      })
    ]);

    // ArticleWithRelations形式に変換
    const articlesWithRelations = articles.map(article => ({
      ...article,
      tags: article.tags.map(tag => tag.name)
    }));

    return NextResponse.json({
      articles: articlesWithRelations,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Favorite articles error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}