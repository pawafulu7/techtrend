import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import {
  validateUser,
  createUserDeletedResponse,
} from '@/lib/middleware/with-user-validation';
import { handlePrismaError } from '@/lib/utils/prisma-error-handler';
import logger from '@/lib/logger';
import {
  updateFavoriteCacheBestEffort,
  setFavoriteBustCookie,
} from '@/lib/favorites/cache-helpers';

// GET: 特定の記事がお気に入りに追加されているか確認
export async function GET(
  request: Request,
  { params }: { params: Promise<{ articleId: string }> }
) {
  try {
    
    const session = await auth();
    const { articleId } = await params;
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { isFavorited: false },
        { status: 200 }
      );
    }

    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_articleId: {
          userId: session.user.id,
          articleId: articleId,
        },
      },
    });

    return NextResponse.json({
      isFavorited: !!favorite,
      favoriteId: favorite?.id || null,
    });
  } catch (error) {
    logger.error({ error }, 'Favorite GET failed');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: 記事をお気に入りに追加
async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ articleId: string }> }
) {
  try {
    const session = await auth();
    const { articleId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Validate user exists and is not deleted
    const validatedUser = await validateUser(session);
    if (!validatedUser) {
      return createUserDeletedResponse();
    }

    // 記事の存在確認
    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      return NextResponse.json(
        { error: 'Article not found' },
        { status: 404 }
      );
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
      return NextResponse.json(
        { error: 'Already favorited' },
        { status: 409 }
      );
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
      isFavorited: true,
      favoriteId: favorite.id,
    });
    setFavoriteBustCookie(response);
    return response;
  } catch (error) {
    // Handle FK constraint violations (race condition with user deletion)
    const prismaErrorResponse = handlePrismaError(error);
    if (prismaErrorResponse) {
      return prismaErrorResponse;
    }

    logger.error({ error }, 'Favorite POST failed');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: お気に入りから削除
async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ articleId: string }> }
) {
  try {
    const session = await auth();
    const { articleId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Validate user exists and is not deleted
    const validatedUser = await validateUser(session);
    if (!validatedUser) {
      return createUserDeletedResponse();
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
      isFavorited: false,
    });
    setFavoriteBustCookie(response);
    return response;
  } catch (error) {
    // Handle FK constraint violations (race condition with user deletion)
    const prismaErrorResponse = handlePrismaError(error);
    if (prismaErrorResponse) {
      return prismaErrorResponse;
    }

    logger.error({ error }, 'Favorite DELETE failed');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const POST = withCSRFProtection(postHandler);
export const DELETE = withCSRFProtection(deleteHandler);
