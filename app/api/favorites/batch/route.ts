import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import { favoriteCache } from '@/lib/cache/favorites-cache';
import logger from '@/lib/logger';

/**
 * お気に入り状態を一括取得するAPI
 * POST /api/favorites/batch
 * Body: { articleIds: string[] }
 * Response: { favorites: { [articleId: string]: boolean } }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { articleIds } = body;

    if (!Array.isArray(articleIds) || articleIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid articleIds' },
        { status: 400 }
      );
    }

    // 最大100件まで
    if (articleIds.length > 100) {
      return NextResponse.json(
        { error: 'Too many articleIds (max: 100)' },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    // キャッシュから取得を試みる
    const cachedFavorites = await favoriteCache.getBatch(userId, articleIds);

    if (cachedFavorites) {
      logger.debug({ userId, count: articleIds.length }, 'Favorites batch cache hit');
      return NextResponse.json({ favorites: cachedFavorites });
    }

    // キャッシュミスの場合、DBから取得
    logger.debug({ userId, count: articleIds.length }, 'Favorites batch cache miss, fetching from DB');

    const favorites = await prisma.favorite.findMany({
      where: {
        userId,
        articleId: {
          in: articleIds
        }
      },
      select: {
        articleId: true
      }
    });

    // お気に入り状態のマップを作成
    const favoritesMap: { [key: string]: boolean } = {};
    const favoriteArticleIds = new Set(favorites.map(f => f.articleId));

    for (const articleId of articleIds) {
      favoritesMap[articleId] = favoriteArticleIds.has(articleId);
    }

    // キャッシュに保存
    await favoriteCache.setBatch(userId, favoritesMap);

    return NextResponse.json({ favorites: favoritesMap });
  } catch (error) {
    logger.error({ error }, 'Failed to get batch favorites');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * お気に入り状態を一括取得するAPI（GET版）
 * URLパラメータで記事IDを指定
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const articleIdsParam = searchParams.get('articleIds');

    if (!articleIdsParam) {
      return NextResponse.json(
        { error: 'Missing articleIds parameter' },
        { status: 400 }
      );
    }

    const articleIds = articleIdsParam.split(',').filter(id => id.trim());

    if (articleIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid articleIds' },
        { status: 400 }
      );
    }

    // 最大100件まで
    if (articleIds.length > 100) {
      return NextResponse.json(
        { error: 'Too many articleIds (max: 100)' },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    // キャッシュから取得を試みる
    const cachedFavorites = await favoriteCache.getBatch(userId, articleIds);

    if (cachedFavorites) {
      logger.debug({ userId, count: articleIds.length }, 'Favorites batch cache hit (GET)');
      return NextResponse.json({ favorites: cachedFavorites });
    }

    // キャッシュミスの場合、DBから取得
    logger.debug({ userId, count: articleIds.length }, 'Favorites batch cache miss (GET), fetching from DB');

    const favorites = await prisma.favorite.findMany({
      where: {
        userId,
        articleId: {
          in: articleIds
        }
      },
      select: {
        articleId: true
      }
    });

    // お気に入り状態のマップを作成
    const favoritesMap: { [key: string]: boolean } = {};
    const favoriteArticleIds = new Set(favorites.map(f => f.articleId));

    for (const articleId of articleIds) {
      favoritesMap[articleId] = favoriteArticleIds.has(articleId);
    }

    // キャッシュに保存
    await favoriteCache.setBatch(userId, favoritesMap);

    return NextResponse.json({ favorites: favoritesMap });
  } catch (error) {
    logger.error({ error }, 'Failed to get batch favorites (GET)');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}