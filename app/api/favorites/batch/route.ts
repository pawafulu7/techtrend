import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createFavoriteLoader } from '@/lib/dataloader/favorite-loader';
import { parseBoolean } from '@/lib/utils/env-parser';
import logger from '@/lib/logger';
import {
  withUserValidation,
  type WithUserValidationContext,
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
async function postHandler(
  request: NextRequest,
  context: WithUserValidationContext
) {
  const startTime = Date.now();
  const userId = context.validatedUser.id;

  try {
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

    // DB から直接引く。Redis のユーザー単位キャッシュは使わない（issue #653）。
    // 「DB を読む → キャッシュに書く」の間にトグル（DB 更新 → キャッシュ更新）が
    // 割り込むと、トグル前の状態がキャッシュに残り、最大 TTL のあいだ誤答する。
    // (userId, articleId) の一意インデックスで最大 100 件を引くだけなので、
    // キャッシュで省ける負荷はほとんど無い
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
  withRateLimit('read:favorite:batch', withUserValidation(postHandler))
);
