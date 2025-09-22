import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { createFavoriteLoader } from '@/lib/dataloader/favorite-loader';
import { favoriteCache } from '@/lib/cache/favorites-cache';
import { parseBoolean } from '@/lib/utils/env-parser';
import logger from '@/lib/logger';

// DataLoaderインスタンスキャッシュ
// リクエストスコープでDataLoaderを再利用
const dataLoaderCache = new WeakMap<any, ReturnType<typeof createFavoriteLoader>>();

/**
 * お気に入り状態を一括取得するAPI
 * DataLoaderパターンを使用してN+1問題を解決
 * POST /api/favorites/batch
 * Body: { articleIds: string[], useDataLoader?: boolean }
 * Response: { favorites: { [articleId: string]: boolean } }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { articleIds, useDataLoader = false } = body; // DataLoader使用フラグ（デフォルト: false）

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

    // DataLoader方式とキャッシュ方式を環境変数で切り替え可能にする
    // 環境変数の解析を堅牢化
    const shouldUseDataLoader = useDataLoader && parseBoolean(process.env.USE_DATALOADER, true);

    if (shouldUseDataLoader) {
      // DataLoaderインスタンスをキャッシュから取得または作成
      let loader = dataLoaderCache.get(request);
      if (!loader) {
        loader = createFavoriteLoader(userId);
        dataLoaderCache.set(request, loader);
      }
      const favoriteStatuses = await loader.loadMany(articleIds);

      // DataLoader結果を既存APIレスポンス形式に変換
      const favoritesMap: { [key: string]: boolean } = {};
      favoriteStatuses.forEach((status, index) => {
        if (status && !(status instanceof Error)) {
          favoritesMap[articleIds[index]] = status.isFavorited;
        } else {
          favoritesMap[articleIds[index]] = false;
        }
      });

      const responseTime = Date.now() - startTime;
      const response = NextResponse.json({ favorites: favoritesMap });
      response.headers.set('X-Response-Time', `${responseTime}ms`);
      response.headers.set('X-Query-Strategy', 'dataloader');

      logger.info({
        userId,
        count: articleIds.length,
        responseTime,
        strategy: 'dataloader',
      }, 'Favorites batch fetched via DataLoader');

      return response;
    }

    // 既存のキャッシュ方式（フォールバック）
    const cachedFavorites = await favoriteCache.getBatch(userId, articleIds);

    if (cachedFavorites) {
      const responseTime = Date.now() - startTime;
      const response = NextResponse.json({ favorites: cachedFavorites });
      response.headers.set('X-Response-Time', `${responseTime}ms`);
      response.headers.set('X-Query-Strategy', 'cache');

      logger.debug({
        userId,
        count: articleIds.length,
        responseTime,
      }, 'Favorites batch cache hit');

      return response;
    }

    // キャッシュミスの場合、DBから取得（既存の処理）
    logger.debug({ userId, count: articleIds.length }, 'Favorites batch cache miss, fetching from DB');

    const { prisma } = await import('@/lib/prisma');
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

    const responseTime = Date.now() - startTime;
    const response = NextResponse.json({ favorites: favoritesMap });
    response.headers.set('X-Response-Time', `${responseTime}ms`);
    response.headers.set('X-Query-Strategy', 'direct-db');

    return response;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error({
      error,
      responseTime,
    }, 'Failed to get batch favorites');

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

