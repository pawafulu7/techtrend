import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { enabledSourceWhere } from '@/lib/database/enabled-source-filter';
import { loadUserDataMaps } from '@/app/api/articles/list/response-builder';
import { mergeUserDataIntoItems } from '@/app/api/articles/list/types';

// ストーリーの ID は代表の記事の ID（cuid）
const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9]+$/i);

// 1つのストーリーの記事数の上限（直近7日の実測では最大9件）
const MAX_STORY_ARTICLES = 50;

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
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INVALID_STORY_ID', message: 'Invalid story id' },
      },
      { status: 400 }
    );
  }
  const storyId = parsed.data;

  try {
    const articles = await prisma.article.findMany({
      where: {
        storyId,
        isHidden: false,
        AND: [enabledSourceWhere()],
      },
      select: {
        id: true,
        title: true,
        translatedTitle: true,
        publishedAt: true,
        source: { select: { id: true, name: true } },
      },
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
      take: MAX_STORY_ARTICLES,
    });

    const items = articles.map((article) => ({
      ...article,
      publishedAt: article.publishedAt.toISOString(),
    }));

    const userId = context.session?.user?.id;
    const userDataIncluded = Boolean(userId && items.length > 0);
    const data = userDataIncluded
      ? await loadUserDataMaps(
          items.map((a) => a.id),
          userId!,
          false
        ).then(({ favoritesMap, readStatusMap }) =>
          mergeUserDataIntoItems(items, favoritesMap, readStatusMap)
        )
      : items;

    return NextResponse.json(
      {
        success: true,
        data: { storyId, items: data },
        meta: { userDataIncluded },
      },
      // ユーザーごとの状態を含むため共有キャッシュに載せない
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    logger.error({ err: error, storyId }, 'Failed to fetch story articles');
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch story articles',
        },
      },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:stories', handler);
