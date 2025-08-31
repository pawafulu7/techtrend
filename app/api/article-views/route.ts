import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';

// GET: ユーザーの閲覧履歴を取得
export async function GET(request: Request) {
  try {
    
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // 90日前の日付を計算
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [views, total] = await Promise.all([
      prisma.articleView.findMany({
        where: { 
          userId: session.user.id,
          viewedAt: {
            gte: ninetyDaysAgo, // 90日以内の履歴のみ取得
          }
        },
        include: {
          article: {
            include: {
              source: true,
              tags: true,
            },
          },
        },
        orderBy: { viewedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.articleView.count({
        where: { 
          userId: session.user.id,
          viewedAt: {
            gte: ninetyDaysAgo, // カウントも90日以内のみ
          }
        },
      }),
    ]);

    return NextResponse.json({
      views: views.map(v => ({
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
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE: 閲覧履歴をクリア
export async function DELETE(_request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // viewedAtがnullでない記録のみ削除
    const result = await prisma.articleView.deleteMany({
      where: {
        userId: session.user.id,
        viewedAt: { not: null }
      }
    });
    
    return NextResponse.json({
      message: 'View history cleared',
      clearedCount: result.count
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
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
      return NextResponse.json({ message: 'View not recorded (not logged in)' });
    }

    const { articleId } = await request.json();

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
      return NextResponse.json(
        { error: 'Article not found' },
        { status: 404 }
      );
    }

    // 既存の閲覧記録を確認（ユニーク制約があるため）
    const existingView = await prisma.articleView.findFirst({
      where: {
        userId: session.user.id,
        articleId,
      },
    });

    if (existingView) {
      // 既存の記録がある場合は時刻を更新
      const updatedView = await prisma.articleView.update({
        where: { id: existingView.id },
        data: { 
          viewedAt: new Date(),
          isRead: true,  // 閲覧時は既読にする
          readAt: existingView.readAt || new Date()
        },
      });

      return NextResponse.json({
        message: 'View timestamp updated',
        viewId: updatedView.id,
      });
    }

    // 新規閲覧記録を作成
    const view = await prisma.articleView.create({
      data: {
        userId: session.user.id,
        articleId,
        viewedAt: new Date(),  // 明示的に設定
        isRead: true,
        readAt: new Date()
      },
    });

    // クリーンアップ処理: 古い履歴と超過分を削除
    // 90日以上前の履歴を削除
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    await prisma.articleView.deleteMany({
      where: {
        userId: session.user.id,
        viewedAt: {
          lt: ninetyDaysAgo,
        },
      },
    });

    // 閲覧履歴が100件を超える場合は古い履歴をクリア（既読状態は保持）
    const viewedCount = await prisma.articleView.count({
      where: { 
        userId: session.user.id,
        viewedAt: { not: null }  // 閲覧履歴のあるレコードのみカウント
      },
    });

    if (viewedCount > 100) {
      // 最新100件の閲覧履歴を保持
      const recentViews = await prisma.articleView.findMany({
        where: { 
          userId: session.user.id,
          viewedAt: { not: null }  // 閲覧履歴のみ対象
        },
        orderBy: { viewedAt: 'desc' },
        take: 100,
        select: { id: true },
      });

      const recentViewIds = recentViews.map(v => v.id);

      // 削除ではなく、viewedAtをNULLに更新（既読状態は保持）
      await prisma.articleView.updateMany({
        where: {
          userId: session.user.id,
          viewedAt: { not: null },
          id: { notIn: recentViewIds },
        },
        data: {
          viewedAt: null  // 閲覧履歴のみクリア、isReadとreadAtは保持
        }
      });
    }

    return NextResponse.json({
      message: 'Article view recorded',
      viewId: view.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}