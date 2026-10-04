import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import logger from '@/lib/logger';
import {
  withUserValidation,
  type WithUserValidationContext,
} from '@/lib/middleware/with-user-validation';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';

const batchFavoritesSchema = z.object({
  articleIds: z.array(z.string().trim().min(1)).min(1).max(100),
});

/**
 * お気に入り状態を一括取得するAPI（一覧画面の app/hooks/use-favorite-statuses.ts が使う）
 * POST /api/favorites/batch
 * Body: { articleIds: string[] }
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
    const { articleIds } = parsed.data;

    // DB から直接引く。Redis などのキャッシュは使わない（issue #653）。
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
        err: error,
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
