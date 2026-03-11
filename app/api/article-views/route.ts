import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import {
  validateUser,
  createUserDeletedResponse,
} from '@/lib/middleware/with-user-validation';
import { handlePrismaError } from '@/lib/utils/prisma-error-handler';

// GET: ユーザーの閲覧履歴を取得
export async function GET(request: Request) {
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
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// DELETE: 閲覧履歴をクリア
export async function DELETE(_request: Request) {
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

    // viewedAtがnullでない記録のみ削除
    const result = await prisma.articleView.deleteMany({
      where: {
        userId: session.user.id,
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
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// POST: 記事閲覧を記録
export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      // 未ログインユーザーの場合は記録しない
      return NextResponse.json({
        message: 'View not recorded (not logged in)',
      });
    }

    // Validate user exists and is not deleted
    const validatedUser = await validateUser(session);
    if (!validatedUser) {
      return createUserDeletedResponse();
    }

    let articleId: string;
    try {
      const body = await request.json();
      articleId = body.articleId;
    } catch (e) {
      logger.error({ err: e as Error }, 'Failed to parse request body');
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    if (!articleId) {
      return NextResponse.json(
        { error: 'Article ID is required' },
        { status: 400 }
      );
    }

    // 記事の存在確認
    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    // upsert: findFirst + update/create + P2002 catch を統合
    const view = await prisma.articleView.upsert({
      where: {
        userId_articleId: {
          userId: session.user.id,
          articleId,
        },
      },
      create: {
        userId: session.user.id,
        articleId,
        viewedAt: new Date(),
        isRead: true,
        readAt: new Date(),
      },
      update: {
        viewedAt: new Date(),
        isRead: true,
        // readAt: 既存値を保持（create時に設定済み、upsertのupdateでは更新しない）
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
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
