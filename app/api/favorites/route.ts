import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import {
  withUserValidation,
  type WithUserValidationContext,
} from '@/lib/middleware/with-user-validation';
import { handlePrismaError } from '@/lib/utils/prisma-error-handler';
import logger from '@/lib/logger';
import {
  updateFavoriteCacheBestEffort,
  setFavoriteBustCookie,
} from '@/lib/favorites/cache-helpers';

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
                select: {
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
                },
              },
            }
          : includeRelations
            ? {
                article: {
                  include: {
                    source: true,
                    tags: true,
                  },
                },
              }
            : {
                article: {
                  select: {
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
                    tags: {
                      select: {
                        id: true,
                        name: true,
                      },
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
    logger.error({ error }, 'Favorites GET failed');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

const FavoriteRequestSchema = z.object({
  articleId: z.string().min(1, 'Article ID is required'),
});

// POST: 記事をお気に入りに追加
async function postHandler(
  request: NextRequest,
  context: WithUserValidationContext
) {
  const { validatedUser } = context;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parseResult = FavoriteRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Article ID is required' },
        { status: 400 }
      );
    }
    const { articleId } = parseResult.data;

    // 記事の存在確認
    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    // 既にお気に入りに追加されているか確認
    const existing = await prisma.favorite.findUnique({
      where: {
        userId_articleId: {
          userId: validatedUser.id,
          articleId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: 'Already favorited' }, { status: 409 });
    }

    const favorite = await prisma.favorite.create({
      data: {
        userId: validatedUser.id,
        articleId,
      },
      include: {
        article: {
          select: {
            id: true,
            title: true,
            url: true,
            summary: true,
            thumbnail: true,
            publishedAt: true,
          },
        },
      },
    });

    // キャッシュを更新（DataLoaderキャッシュも含む）- best-effort
    await updateFavoriteCacheBestEffort(
      validatedUser.id,
      articleId,
      true,
      favorite.createdAt
    );

    const response = NextResponse.json({
      message: 'Article favorited successfully',
      favorite: {
        ...favorite.article,
        favoriteId: favorite.id,
        favoritedAt: favorite.createdAt,
      },
    });
    setFavoriteBustCookie(response);
    return response;
  } catch (error) {
    // Handle FK constraint violations (race condition with user deletion)
    const prismaErrorResponse = handlePrismaError(error);
    if (prismaErrorResponse) {
      return prismaErrorResponse;
    }

    logger.error({ error }, 'Favorites POST failed');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: お気に入りから削除
async function deleteHandler(
  request: NextRequest,
  context: WithUserValidationContext
) {
  const { validatedUser } = context;

  try {
    const { searchParams } = new URL(request.url);
    const articleId = searchParams.get('articleId');

    if (!articleId) {
      return NextResponse.json(
        { error: 'Article ID is required' },
        { status: 400 }
      );
    }

    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_articleId: {
          userId: validatedUser.id,
          articleId,
        },
      },
    });

    if (!favorite) {
      return NextResponse.json(
        { error: 'Favorite not found' },
        { status: 404 }
      );
    }

    await prisma.favorite.delete({
      where: {
        id: favorite.id,
      },
    });

    // キャッシュを更新（DataLoaderキャッシュも含む）- best-effort
    await updateFavoriteCacheBestEffort(validatedUser.id, articleId, false);

    const response = NextResponse.json({
      message: 'Article removed from favorites',
    });
    setFavoriteBustCookie(response);
    return response;
  } catch (error) {
    // Handle FK constraint violations (race condition with user deletion)
    const prismaErrorResponse = handlePrismaError(error);
    if (prismaErrorResponse) {
      return prismaErrorResponse;
    }

    logger.error({ error }, 'Favorites DELETE failed');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withUserValidation(getHandler);
export const POST = withCSRFProtection(
  withRateLimit('write:favorite', withUserValidation(postHandler))
);
export const DELETE = withCSRFProtection(
  withRateLimit('write:favorite', withUserValidation(deleteHandler))
);
