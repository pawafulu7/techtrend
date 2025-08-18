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

    // 重複を除去（同じ記事の複数回閲覧を最新のもののみに）
    const uniqueViews = views.reduce((acc, view) => {
      const existing = acc.find(v => v.article.id === view.article.id);
      if (!existing || view.viewedAt > existing.viewedAt) {
        return [...acc.filter(v => v.article.id !== view.article.id), view];
      }
      return acc;
    }, [] as typeof views);

    return NextResponse.json({
      views: uniqueViews.map(v => ({
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
    console.error('Failed to fetch article views:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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

    // 同じ記事の最近の閲覧記録を確認（1時間以内は重複記録しない）
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentView = await prisma.articleView.findFirst({
      where: {
        userId: session.user.id,
        articleId,
        viewedAt: {
          gte: oneHourAgo,
        },
      },
    });

    if (recentView) {
      // 最近閲覧済みの場合は時刻を更新
      const updatedView = await prisma.articleView.update({
        where: { id: recentView.id },
        data: { viewedAt: new Date() },
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

    // 100件を超える場合は古い履歴を削除
    const userViewCount = await prisma.articleView.count({
      where: { userId: session.user.id },
    });

    if (userViewCount > 100) {
      // 最新100件以外を削除するため、101件目以降のIDを取得
      const viewsToKeep = await prisma.articleView.findMany({
        where: { userId: session.user.id },
        orderBy: { viewedAt: 'desc' },
        take: 100,
        select: { id: true },
      });

      const idsToKeep = viewsToKeep.map(v => v.id);

      await prisma.articleView.deleteMany({
        where: {
          userId: session.user.id,
          id: {
            notIn: idsToKeep,
          },
        },
      });
    }

    return NextResponse.json({
      message: 'Article view recorded',
      viewId: view.id,
    });
  } catch (error) {
    console.error('Failed to record article view:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}