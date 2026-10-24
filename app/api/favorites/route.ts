import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  withUserValidation,
  type WithUserValidationContext,
} from '@/lib/middleware/with-user-validation';
import logger from '@/lib/logger';

const baseArticleSelect = {
  id: true,
  title: true,
  url: true,
  summary: true,
  publishedAt: true,
  thumbnail: true,
  source: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

// GET: ユーザーのお気に入り記事一覧を取得
async function getHandler(
  request: NextRequest,
  context: WithUserValidationContext
) {
  const { validatedUser } = context;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    const includeRelations = searchParams.get('includeRelations') === 'true';
    const lightweight = searchParams.get('lightweight') === 'true';

    // Execute count and findMany in transaction for consistency
    const [total, favorites] = await prisma.$transaction([
      prisma.favorite.count({
        where: { userId: validatedUser.id },
      }),
      prisma.favorite.findMany({
        where: { userId: validatedUser.id },
        include: lightweight
          ? {
              article: {
                select: baseArticleSelect,
              },
            }
          : includeRelations
            ? {
                article: {
                  include: { source: true, tags: true },
                },
              }
            : {
                article: {
                  select: {
                    ...baseArticleSelect,
                    tags: {
                      select: { id: true, name: true },
                    },
                  },
                },
              },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      favorites: favorites.map((f) => ({
        ...f.article,
        favoriteId: f.id,
        favoritedAt: f.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Favorites GET failed');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withUserValidation(getHandler);
