import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/auth';
import { createFavoriteLoader } from '@/lib/dataloader/favorite-loader';
import { favoriteCache } from '@/lib/cache/favorites-cache';
import { parseBoolean } from '@/lib/utils/env-parser';
import logger from '@/lib/logger';
import {
  validateUser,
  createUserDeletedResponse,
} from '@/lib/middleware/with-user-validation';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { env } from '@/lib/config/env';

const batchFavoritesSchema = z.object({
  articleIds: z.array(z.string().trim().min(1)).min(1).max(100),
  useDataLoader: z.boolean().optional().default(false),
});

// DataLoaderインスタンスキャッシュ
// リクエストスコープでDataLoaderを再利用
const dataLoaderCache = new WeakMap<
  any,
  ReturnType<typeof createFavoriteLoader>
>();

/**
 * お気に入り状態を一括取得するAPI
 * DataLoaderパターンを使用してN+1問題を解決
 * POST /api/favorites/batch
 * Body: { articleIds: string[], useDataLoader?: boolean }
 * Response: { favorites: { [articleId: string]: boolean } }
 */
async function postHandler(request: NextRequest) {
  const startTime = Date.now();

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

    // JSONパースエラーを適切にハンドリング
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      const responseTime = Date.now() - startTime;
      const res = NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
      res.headers.set('X-Response-Time', `${responseTime}ms`);
      return res;
    }
    const parsed = batchFavoritesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid articleIds' },
        { status: 400 }
      );
    }
    const { articleIds, useDataLoader } = parsed.data;

    const userId = session.user.id;

    // DataLoader方式とキャッシュ方式を環境変数で切り替え可能にする
    // 環境変数の解析を堅牢化（デフォルトはfalseで安全側に）
    const shouldUseDataLoader =
      useDataLoader && parseBoolean(env.USE_DATALOADER, false);

    if (shouldUseDataLoader) {
      // DataLoaderインスタンスをキャッシュから取得または作成
      let loader = dataLoaderCache.get(request);
      if (!loader) {
        loader = createFavoriteLoader(userId);
        dataLoaderCache.set(request, loader);
      }
      const favoriteStatuses = await loader.loadMany(articleIds);

      // DataLoader結果を既存APIレスポンス形式に変換（型チェック強化）
      const favoritesMap: Record<string, boolean> = {};
      favoriteStatuses.forEach((status, index) => {
        const id = articleIds[index];
        if (status instanceof Error) {
          favoritesMap[id] = false;
          return;
        }
        // DataLoaderの戻り値の型を安全にチェック
        if (
          typeof status === 'object' &&
          status !== null &&
          'isFavorited' in status
        ) {
          const statusObj = status as { isFavorited: boolean };
          favoritesMap[id] = Boolean(statusObj.isFavorited);
        } else if (typeof status === 'boolean') {
          favoritesMap[id] = status;
        } else {
          favoritesMap[id] = false;
        }
      });

      const responseTime = Date.now() - startTime;
      const response = NextResponse.json({ favorites: favoritesMap });
      response.headers.set('X-Response-Time', `${responseTime}ms`);
      response.headers.set('X-Query-Strategy', 'dataloader');

      logger.info(
        {
          userId,
          count: articleIds.length,
          responseTime,
          strategy: 'dataloader',
        },
        'Favorites batch fetched via DataLoader'
      );

      return response;
    }

    // 既存のキャッシュ方式（フォールバック）
    const cachedFavorites = await favoriteCache.getBatch(userId, articleIds);

    if (cachedFavorites) {
      const responseTime = Date.now() - startTime;
      const response = NextResponse.json({ favorites: cachedFavorites });
      response.headers.set('X-Response-Time', `${responseTime}ms`);
      response.headers.set('X-Query-Strategy', 'cache');

      logger.debug(
        {
          userId,
          count: articleIds.length,
          responseTime,
        },
        'Favorites batch cache hit'
      );

      return response;
    }

    // キャッシュミスの場合、DBから取得（既存の処理）
    logger.debug(
      { userId, count: articleIds.length },
      'Favorites batch cache miss, fetching from DB'
    );

    const { prisma } = await import('@/lib/prisma');
    const favorites = await prisma.favorite.findMany({
      where: {
        userId,
        articleId: {
          in: articleIds,
        },
      },
      select: {
        articleId: true,
      },
    });

    // お気に入り状態のマップを作成
    const favoritesMap: { [key: string]: boolean } = {};
    const favoriteArticleIds = new Set(favorites.map((f) => f.articleId));

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
    logger.error(
      {
        error,
        responseTime,
      },
      'Failed to get batch favorites'
    );

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const POST = withCSRFProtection(
  withRateLimit('read:favorite:batch', postHandler)
);
