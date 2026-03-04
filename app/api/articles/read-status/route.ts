import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getRedisService } from '@/lib/redis/factory';
import logger from '@/lib/logger';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import {
  invalidateUserViewCache,
  invalidateViewCache,
} from '@/lib/dataloader/article-view-loader';
import {
  withUserValidation,
  type WithUserValidationContext,
} from '@/lib/middleware/with-user-validation';
import { handlePrismaError } from '@/lib/utils/prisma-error-handler';
import { digestService } from '@/lib/services/digest-service';

// GET: 記事の既読状態を取得
async function getHandler(
  req: NextRequest,
  context: WithUserValidationContext
) {
  const { validatedUser } = context;

  try {
    const { searchParams } = new URL(req.url);
    const articleIds = searchParams.get('articleIds')?.split(',') || [];

    // 未読カウント条件（90日以内の記事のみ対象）
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const unreadWhere = {
      publishedAt: { gte: ninetyDaysAgo },
      OR: [
        {
          articleViews: {
            none: {
              userId: validatedUser.id,
            },
          },
        },
        {
          articleViews: {
            some: {
              userId: validatedUser.id,
              isRead: false,
            },
          },
        },
      ],
    };

    // 既読記事取得用のwhere条件
    const readArticlesWhere = {
      userId: validatedUser.id,
      isRead: true,
      ...(articleIds.length > 0 ? { articleId: { in: articleIds } } : {}),
    };

    // トランザクションで両方のクエリを実行
    const [unreadCount, readArticles] = await prisma.$transaction([
      prisma.article.count({ where: unreadWhere }),
      prisma.articleView.findMany({
        where: readArticlesWhere,
        select: { articleId: true },
      }),
    ]);

    return NextResponse.json({
      readArticleIds: readArticles.map((a) => a.articleId),
      unreadCount,
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching read status');
    return NextResponse.json(
      { error: 'Failed to fetch read status' },
      { status: 500 }
    );
  }
}

// POST: 記事を既読にマーク
async function postHandler(
  req: NextRequest,
  context: WithUserValidationContext
) {
  const { validatedUser } = context;

  try {
    const { articleId } = await req.json();
    if (!articleId) {
      return NextResponse.json(
        { error: 'Article ID is required' },
        { status: 400 }
      );
    }

    // Upsert: 既存のレコードがあれば更新、なければ作成
    const articleView = await prisma.articleView.upsert({
      where: {
        userId_articleId: {
          userId: validatedUser.id,
          articleId,
        },
      },
      update: {
        isRead: true,
        readAt: new Date(),
        // viewedAtは更新しない（既読マークのみ）
      },
      create: {
        userId: validatedUser.id,
        articleId,
        isRead: true,
        readAt: new Date(),
      },
    });

    // Invalidate view-status cache so list endpoints return fresh isRead immediately
    try {
      await invalidateViewCache(validatedUser.id, articleId);
    } catch (cacheError) {
      logger.warn(
        { error: cacheError, userId: validatedUser.id, articleId },
        'Failed to invalidate view cache'
      );
    }

    // Also invalidate digest cache (fire-and-forget)
    digestService.invalidateUserCache(validatedUser.id).catch((error) => {
      logger.warn(
        { error, userId: validatedUser.id },
        'Failed to invalidate digest cache'
      );
    });

    return NextResponse.json({ success: true, articleView });
  } catch (error) {
    // Handle FK constraint violations (race condition with user deletion)
    const prismaErrorResponse = handlePrismaError(error);
    if (prismaErrorResponse) {
      return prismaErrorResponse;
    }

    logger.error({ error }, 'Error marking article as read');
    return NextResponse.json(
      { error: 'Failed to mark article as read' },
      { status: 500 }
    );
  }
}

// PUT: 全未読記事を一括既読にマーク
async function putHandler(
  _req: NextRequest,
  context: WithUserValidationContext
) {
  const { validatedUser } = context;

  try {
    // SQL直接実行による高速化
    // gen_random_uuid()はPostgreSQL 13以降で使用可能
    // GETハンドラと同じ90日基準を使用（アプリ時間で統一）
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const result = await prisma.$executeRaw`
      INSERT INTO "ArticleView" ("id", "userId", "articleId", "isRead", "readAt", "viewedAt")
      SELECT
        gen_random_uuid(),
        ${validatedUser.id},
        a.id,
        true,
        NOW(),
        NULL
      FROM "Article" a
      WHERE a."publishedAt" >= ${ninetyDaysAgo}
        AND NOT EXISTS (
          SELECT 1 FROM "ArticleView" av
          WHERE av."userId" = ${validatedUser.id}
          AND av."articleId" = a.id
          AND av."isRead" = true
        )
      ON CONFLICT ("userId", "articleId")
      DO UPDATE SET
        "isRead" = true,
        "readAt" = NOW()
    `;

    // 処理件数を取得
    const markedCount = result;

    // Redisキャッシュをクリア
    const redisService = getRedisService();
    if (redisService) {
      try {
        await redisService.clearPattern(`unread:${validatedUser.id}*`);
        await redisService.clearPattern(`read:${validatedUser.id}*`);
      } catch (redisError) {
        logger.error({ error: redisError }, 'Redis cache clear error');
        // Redisエラーは無視して処理を続行
      }
    }

    // Also clear DataLoader view-status cache (L1/L2) for this user
    try {
      await invalidateUserViewCache(validatedUser.id);
    } catch (cacheError) {
      logger.warn(
        { error: cacheError, userId: validatedUser.id },
        'Failed to invalidate user view cache'
      );
    }

    // Also invalidate digest cache (fire-and-forget)
    digestService.invalidateUserCache(validatedUser.id).catch((error) => {
      logger.warn(
        { error, userId: validatedUser.id },
        'Failed to invalidate digest cache'
      );
    });

    return NextResponse.json({
      success: true,
      markedCount,
      remainingUnreadCount: 0,
    });
  } catch (error) {
    // Handle FK constraint violations (race condition with user deletion)
    const prismaErrorResponse = handlePrismaError(error);
    if (prismaErrorResponse) {
      return prismaErrorResponse;
    }

    logger.error({ error }, 'Error marking all articles as read');
    return NextResponse.json(
      { error: 'Failed to mark all articles as read' },
      { status: 500 }
    );
  }
}

// DELETE: 記事を未読に戻す
async function deleteHandler(
  req: NextRequest,
  context: WithUserValidationContext
) {
  const { validatedUser } = context;

  try {
    const { searchParams } = new URL(req.url);
    const articleId = searchParams.get('articleId');

    if (!articleId) {
      return NextResponse.json(
        { error: 'Article ID is required' },
        { status: 400 }
      );
    }

    // 既読状態をfalseに更新
    await prisma.articleView.updateMany({
      where: {
        userId: validatedUser.id,
        articleId,
      },
      data: {
        isRead: false,
        readAt: null,
      },
    });

    // Invalidate view-status cache so list endpoints return fresh isRead immediately
    try {
      await invalidateViewCache(validatedUser.id, articleId);
    } catch (cacheError) {
      logger.warn(
        { error: cacheError, userId: validatedUser.id, articleId },
        'Failed to invalidate view cache'
      );
    }

    // Also invalidate digest cache (fire-and-forget)
    digestService.invalidateUserCache(validatedUser.id).catch((error) => {
      logger.warn(
        { error, userId: validatedUser.id },
        'Failed to invalidate digest cache'
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    // Handle FK constraint violations (race condition with user deletion)
    const prismaErrorResponse = handlePrismaError(error);
    if (prismaErrorResponse) {
      return prismaErrorResponse;
    }

    logger.error({ error }, 'Error marking article as unread');
    return NextResponse.json(
      { error: 'Failed to mark article as unread' },
      { status: 500 }
    );
  }
}

export const GET = withUserValidation(getHandler);
export const POST = withCSRFProtection(
  withRateLimit('write:read-status', withUserValidation(postHandler))
);
export const PUT = withCSRFProtection(
  withRateLimit('write:read-status', withUserValidation(putHandler))
);
export const DELETE = withCSRFProtection(
  withRateLimit('write:read-status', withUserValidation(deleteHandler))
);
