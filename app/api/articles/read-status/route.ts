import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/database';
import { getRedisService } from '@/lib/redis/factory';

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
export async function PUT(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // SQL直接実行による高速化
    // gen_random_uuid()はPostgreSQL 13以降で使用可能
    const result = await prisma.$executeRaw`
      INSERT INTO "ArticleView" ("id", "userId", "articleId", "isRead", "readAt", "viewedAt")
      SELECT 
        gen_random_uuid(),
        ${session.user.id},
        a.id,
        true,
        NOW(),
        NULL
      FROM "Article" a
      WHERE NOT EXISTS (
        SELECT 1 FROM "ArticleView" av 
        WHERE av."userId" = ${session.user.id}
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
        await redisService.clearPattern(`unread:${session.user.id}*`);
        await redisService.clearPattern(`read:${session.user.id}*`);
      } catch (redisError) {
        console.error('Redis cache clear error:', redisError);
        // Redisエラーは無視して処理を続行
      }
    }

    return NextResponse.json({ 
      success: true, 
      markedCount,
      remainingUnreadCount: 0
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