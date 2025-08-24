import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/database';

// GET: 記事の既読状態を取得
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ readArticleIds: [] });
    }

    const { searchParams } = new URL(req.url);
    const articleIds = searchParams.get('articleIds')?.split(',') || [];

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
        readArticleIds: readArticles.map(a => a.articleId)
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
      readArticleIds: readArticles.map(a => a.articleId)
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
        readAt: new Date(),
        viewedAt: new Date()
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