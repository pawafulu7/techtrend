import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { enabledSourceWhere } from '@/lib/database/enabled-source-filter';
import {
  DatabaseError,
  ValidationError,
  formatErrorResponse,
} from '@/lib/errors';
import { loadUserDataMaps } from '@/app/api/articles/list/response-builder';
import { mergeUserDataIntoItems } from '@/app/api/articles/list/types';

// ストーリーの ID は代表の記事の ID（cuid）
const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9]+$/i);

// 1回に返す記事数の上限（直近7日の実測では1ストーリー最大9件）。超えた分は total で知らせる
const MAX_STORY_ARTICLES = 100;

interface RouteContext {
  params: Promise<{ id: string }>;
  session?: { user?: { id?: string } } | null;
}

/**
 * 同じストーリーの記事を返す（issue #723）。ホームの一覧で「ほか N 件」を開いたときに使う。
 * ログイン中はお気に入りと既読の状態を付ける
 */
async function handler(request: NextRequest, context: RouteContext) {
  const { id: rawId } = await context.params;
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) {
    const error = new ValidationError('Invalid story id', 'id');
    return NextResponse.json(formatErrorResponse(error), {
      status: error.statusCode,
    });
  }
  const storyId = parsed.data;

  try {
    const where = {
      storyId,
      isHidden: false,
      AND: [enabledSourceWhere()],
    };
    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        select: {
          id: true,
          title: true,
          translatedTitle: true,
          publishedAt: true,
          source: { select: { id: true, name: true } },
        },
        orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
        take: MAX_STORY_ARTICLES,
      }),
      prisma.article.count({ where }),
    ]);

    const items = articles.map((article) => ({
      ...article,
      publishedAt: article.publishedAt.toISOString(),
    }));

    const userId = context.session?.user?.id;
    let data: Array<
      (typeof items)[number] & { isFavorited?: boolean; isRead?: boolean }
    > = items;
    if (userId && items.length > 0) {
      // お気に入りを切り替えた直後は、一覧の API と同じく L1 キャッシュを飛ばす
      const bypassFavoriteL1 = Boolean(
        request.cookies.get('tt_fav_bust')?.value
      );
      const { favoritesMap, readStatusMap } = await loadUserDataMaps(
        items.map((a) => a.id),
        userId,
        bypassFavoriteL1
      );
      data = mergeUserDataIntoItems(items, favoritesMap, readStatusMap);
    }

    return NextResponse.json(
      {
        success: true,
        data: { storyId, items: data, total },
        meta: { userDataIncluded: Boolean(userId && items.length > 0) },
      },
      // ユーザーごとの状態を含むため共有キャッシュに載せない
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    logger.error({ err: error, storyId }, 'Failed to fetch story articles');
    // 元の例外の文言は応答に入れない（DB のエラー文が漏れるため。issue #687）
    const dbError = new DatabaseError(
      'Failed to fetch story articles',
      'select'
    );
    return NextResponse.json(formatErrorResponse(dbError), {
      status: dbError.statusCode,
    });
  }
}

export const GET = withRateLimit('read:stories', handler);
