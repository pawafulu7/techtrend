import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth/auth';
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

// GET: 特定の記事がお気に入りに追加されているか確認
export async function GET(
  request: Request,
  { params }: { params: Promise<{ articleId: string }> }
) {
  try {
    const session = await auth();
    const { articleId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ isFavorited: false }, { status: 200 });
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
  context: WithUserValidationContext & {
    params: Promise<{ articleId: string }>;
  }
) {
  try {
    const { validatedUser } = context;
    const { articleId } = await context.params;

    // 記事の存在確認
    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    try {
      const favorite = await prisma.favorite.create({
        data: {
          userId: validatedUser.id,
          articleId,
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
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        await updateFavoriteCacheBestEffort(validatedUser.id, articleId, true);
        const response = NextResponse.json(
          { error: 'Already favorited' },
          { status: 409 }
        );
        setFavoriteBustCookie(response);
        return response;
      }
      throw error;
    }
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
  context: WithUserValidationContext & {
    params: Promise<{ articleId: string }>;
  }
) {
  try {
    const { validatedUser } = context;
    const { articleId } = await context.params;

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

export const POST = withCSRFProtection(
  withRateLimit('write:favorite', withUserValidation(postHandler))
);
export const DELETE = withCSRFProtection(
  withRateLimit('write:favorite', withUserValidation(deleteHandler))
);
