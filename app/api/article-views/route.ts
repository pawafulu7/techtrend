import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import {
  validateUser,
  createUserDeletedResponse,
  withUserValidation,
  type WithUserValidationContext,
} from '@/lib/middleware/with-user-validation';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { handlePrismaError } from '@/lib/utils/prisma-error-handler';

// GET: ユーザーの閲覧履歴を取得
async function getHandler(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate user exists and is not deleted
    const validatedUser = await validateUser(session);
    if (!validatedUser) {
      return createUserDeletedResponse();
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;
    const includeRelations = searchParams.get('includeRelations') === 'true';
    const lightweight = searchParams.get('lightweight') === 'true';

    // 90日前の日付を計算
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const articleSelect = lightweight
      ? {
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
                type: true,
              },
            },
          },
        }
      : includeRelations
        ? {
            include: {
              source: true,
              tags: true,
            },
          }
        : {
            include: {
              source: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  url: true,
                },
              },
            },
          };

    // Execute count and findMany in transaction for consistency
    const [total, views] = await prisma.$transaction([
      prisma.articleView.count({
        where: {
          userId: session.user.id,
          viewedAt: {
            gte: ninetyDaysAgo, // カウントも90日以内のみ
          },
        },
      }),
      prisma.articleView.findMany({
        where: {
          userId: session.user.id,
          viewedAt: {
            gte: ninetyDaysAgo, // 90日以内の履歴のみ取得
          },
        },
        include: {
          article: articleSelect,
        },
        orderBy: { viewedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      views: views.map((v) => ({
        ...v.article,
        viewId: v.id,
        viewedAt: v.viewedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(
      { err: error as Error, route: '/api/article-views', method: 'GET' },
      'Handler error'
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: 閲覧履歴をクリア
async function deleteHandler(
  _request: Request,
  context: WithUserValidationContext
) {
  try {
    // viewedAtがnullでない記録のみ削除
    const result = await prisma.articleView.deleteMany({
      where: {
        userId: context.validatedUser.id,
        viewedAt: { not: null },
      },
    });

    return NextResponse.json({
      message: 'View history cleared',
      clearedCount: result.count,
    });
  } catch (error) {
    // Handle FK constraint violations (race condition with user deletion)
    const prismaErrorResponse = handlePrismaError(error);
    if (prismaErrorResponse) {
      return prismaErrorResponse;
    }

    logger.error(
      { err: error as Error, route: '/api/article-views', method: 'DELETE' },
      'Handler error'
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

const createViewSchema = z.object({
  articleId: z
    .string({ required_error: 'Article ID is required' })
    .trim()
    .min(1, 'Article ID is required'),
});

// POST: 記事閲覧を記録
async function postHandler(
  request: Request,
  context: WithUserValidationContext
) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = createViewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || 'Invalid request body' },
        { status: 400 }
      );
    }

    const { articleId } = parsed.data;

    // 記事の存在確認
    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    // upsert: findFirst + update/create + P2002 catch を統合
    const now = new Date();
    const view = await prisma.articleView.upsert({
      where: {
        userId_articleId: {
          userId: context.validatedUser.id,
          articleId,
        },
      },
      create: {
        userId: context.validatedUser.id,
        articleId,
        viewedAt: now,
        isRead: true,
        readAt: now,
      },
      update: {
        viewedAt: now,
        isRead: true,
        readAt: now,
      },
    });

    return NextResponse.json({
      message: 'Article view recorded',
      viewId: view.id,
    });
  } catch (error) {
    // Handle FK constraint violations (race condition with user deletion)
    const prismaErrorResponse = handlePrismaError(error);
    if (prismaErrorResponse) {
      return prismaErrorResponse;
    }

    logger.error(
      { err: error as Error, route: '/api/article-views', method: 'POST' },
      'Handler error'
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:article-views', getHandler);

export const POST = withCSRFProtection(
  withRateLimit('write:article-views', withUserValidation(postHandler))
);

export const DELETE = withCSRFProtection(
  withRateLimit('write:article-views', withUserValidation(deleteHandler))
);
