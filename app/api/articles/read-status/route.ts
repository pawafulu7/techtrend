import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/database';

// GET: 記事の既読状態を取得
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ readArticleIds: [], unreadCount: 0 });
    }

    const { searchParams } = new URL(req.url);
    const articleIds = searchParams.get('articleIds')?.split(',') || [];

    // 未読数を取得
    const unreadCount = await prisma.article.count({
      where: {
        OR: [
          {
            articleViews: {
              none: {
                userId: session.user.id
              }
            }
          },
          {
            articleViews: {
              some: {
                userId: session.user.id,
                isRead: false
              }
            }
          }
        ]
      }
    });

    if (articleIds.length === 0) {
      // 全ての既読記事IDを取得
      const readArticles = await prisma.articleView.findMany({
        where: {
          userId: session.user.id,
          isRead: true
        },
        select: {
          articleId: true
        }
      });

      return NextResponse.json({
        readArticleIds: readArticles.map(a => a.articleId),
        unreadCount
      });
    }

    // 特定の記事IDの既読状態を取得
    const readArticles = await prisma.articleView.findMany({
      where: {
        userId: session.user.id,
        articleId: { in: articleIds },
        isRead: true
      },
      select: {
        articleId: true
      }
    });

    return NextResponse.json({
      readArticleIds: readArticles.map(a => a.articleId),
      unreadCount
    });
  } catch (error) {
    console.error('Error fetching read status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch read status' },
      { status: 500 }
    );
  }
}

// POST: 記事を既読にマーク
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

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
          userId: session.user.id,
          articleId
        }
      },
      update: {
        isRead: true,
        readAt: new Date()
        // viewedAtは更新しない（既読マークのみ）
      },
      create: {
        userId: session.user.id,
        articleId,
        isRead: true,
        readAt: new Date()
      }
    });

    return NextResponse.json({ success: true, articleView });
  } catch (error) {
    console.error('Error marking article as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark article as read' },
      { status: 500 }
    );
  }
}

// PUT: 全未読記事を一括既読にマーク
export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // まず未読記事のIDを全て取得
    const unreadArticles = await prisma.article.findMany({
      where: {
        OR: [
          {
            articleViews: {
              none: {
                userId: session.user.id
              }
            }
          },
          {
            articleViews: {
              some: {
                userId: session.user.id,
                isRead: false
              }
            }
          }
        ]
      },
      select: {
        id: true
      }
    });

    if (unreadArticles.length === 0) {
      return NextResponse.json({ 
        success: true,
        markedCount: 0,
        remainingUnreadCount: 0
      });
    }

    // 個別のupsertで処理（createManyではnullを設定できないため）
    const now = new Date();
    for (const article of unreadArticles) {
      await prisma.articleView.upsert({
        where: {
          userId_articleId: {
            userId: session.user.id,
            articleId: article.id
          }
        },
        update: {
          isRead: true,
          readAt: now
          // viewedAtは更新しない（既に閲覧済みの場合は保持）
        },
        create: {
          userId: session.user.id,
          articleId: article.id,
          isRead: true,
          readAt: now
          // viewedAtは指定しない（NULL）
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      markedCount: unreadArticles.length,
      remainingUnreadCount: 0 // 全て既読にしたので0
    });
  } catch (error) {
    console.error('Error marking all articles as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark all articles as read' },
      { status: 500 }
    );
  }
}

// DELETE: 記事を未読に戻す
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

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
        userId: session.user.id,
        articleId
      },
      data: {
        isRead: false,
        readAt: null
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking article as unread:', error);
    return NextResponse.json(
      { error: 'Failed to mark article as unread' },
      { status: 500 }
    );
  }
}