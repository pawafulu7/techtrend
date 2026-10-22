/**
 * Admin Articles API - 記事詳細
 *
 * GET  /api/admin/articles/[id] - 全フィールド含む記事詳細
 * PATCH /api/admin/articles/[id] - 記事の isHidden フラグを更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/lib/prisma-exports';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import { prisma } from '@/lib/prisma';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { articleDetailCache } from '@/lib/cache/article-detail-cache';
import { trendsCache } from '@/lib/cache/trends-cache';
import { keywordsCache } from '@/lib/cache/keywords-cache';
import logger from '@/lib/logger';
import type { AdminArticleDetail } from '@/app/admin/articles/_types';

export const dynamic = 'force-dynamic';

const idSchema = z.cuid();

const patchSchema = z.object({
  isHidden: z.boolean(),
});

export type ArticleWithRelations = {
  id: string;
  title: string;
  translatedTitle: string | null;
  url: string;
  publishedAt: Date;
  sourceId: string;
  source: { id: string; name: string };
  category: string | null;
  qualityScore: number;
  summary: string | null;
  detailedSummary: string | null;
  content: string | null;
  contentLength: number | null;
  difficulty: string | null;
  articleType: string | null;
  summaryVersion: number;
  summaryError: string | null;
  summaryComputedAt: Date | null;
  qualityScoreComputedAt: Date | null;
  contentUpdatedAt: Date | null;
  userVotes: number;
  createdAt: Date;
  updatedAt: Date;
  skipReason: string | null;
  bookmarks: number;
  isHidden: boolean;
  tags: { id: string; name: string }[];
};

export function serializeArticleDetail(
  article: ArticleWithRelations
): AdminArticleDetail {
  return {
    id: article.id,
    title: article.title,
    translatedTitle: article.translatedTitle,
    url: article.url,
    publishedAt: article.publishedAt.toISOString(),
    sourceName: article.source.name,
    sourceId: article.sourceId,
    category: article.category,
    qualityScore: article.qualityScore,
    hasSummary: (article.summary?.trim() ?? '') !== '',
    hasContent: (article.content?.trim() ?? '') !== '',
    skipReason: article.skipReason,
    hasSummaryError: article.summaryError != null,
    bookmarks: article.bookmarks,
    isHidden: article.isHidden,
    summary: article.summary,
    detailedSummary: article.detailedSummary,
    content: article.content,
    contentLength: article.contentLength,
    difficulty: article.difficulty,
    articleType: article.articleType,
    summaryVersion: article.summaryVersion,
    summaryError: article.summaryError,
    summaryComputedAt: article.summaryComputedAt?.toISOString() ?? null,
    qualityScoreComputedAt:
      article.qualityScoreComputedAt?.toISOString() ?? null,
    contentUpdatedAt: article.contentUpdatedAt?.toISOString() ?? null,
    userVotes: article.userVotes,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
    tags: article.tags.map((t) => ({ id: t.id, name: t.name })),
  };
}

async function getHandler(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const parseResult = idSchema.safeParse(id);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid article ID' },
        { status: 400 }
      );
    }

    const article = await prisma.article.findUnique({
      where: { id },
      include: {
        source: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true } },
      },
    });

    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    return NextResponse.json(serializeArticleDetail(article), {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    logger.error(
      { err: error },
      '[AdminArticleDetailAPI] Failed to fetch article'
    );
    return NextResponse.json(
      { error: 'Failed to fetch article' },
      { status: 500 }
    );
  }
}

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const idParseResult = idSchema.safeParse(id);
    if (!idParseResult.success) {
      return NextResponse.json(
        { error: 'Invalid article ID' },
        { status: 400 }
      );
    }

    let body: z.infer<typeof patchSchema>;
    try {
      const rawBody = await request.json();
      body = patchSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Validation failed', details: error.issues },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const updatedArticle = await prisma.article.update({
      where: { id },
      data: { isHidden: body.isHidden },
      include: {
        source: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true } },
      },
    });

    // キャッシュ無効化（best-effort: DB更新成功後の失敗は無視）。互いに独立しているので、
    // 1つが失敗しても残りを試す（順に await すると、前の失敗で後ろの無効化が飛ばされる）
    const invalidations = await Promise.allSettled([
      cacheInvalidator.onArticleUpdated(id),
      // onArticleUpdated は一覧と件数のキャッシュを消さない。非表示の記事は一覧に出さない
      cacheInvalidator.onBulkImport(),
      articleDetailCache.invalidateArticle(id),
      articleDetailCache.invalidateAllRelated(),
      trendsCache.invalidatePattern('*'),
      // 急上昇の集計（トレンド概要）は非表示の記事を数えない
      keywordsCache.invalidateTrending(),
    ]);
    const failedInvalidations = invalidations.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    if (failedInvalidations.length > 0) {
      logger.error(
        {
          articleId: id,
          err: failedInvalidations[0].reason,
          failedCount: failedInvalidations.length,
        },
        '[AdminArticleDetailAPI] Cache invalidation failed (DB update succeeded)'
      );
    }

    logger.info(
      { articleId: id, isHidden: body.isHidden },
      '[AdminArticleDetailAPI] Article visibility updated'
    );

    return NextResponse.json(serializeArticleDetail(updatedArticle), {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }
    logger.error(
      { err: error },
      '[AdminArticleDetailAPI] Failed to update article'
    );
    return NextResponse.json(
      { error: 'Failed to update article' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('admin:read', withAdminAuth(getHandler));
export const PATCH = withCSRFProtection(
  withRateLimit('admin:write', withAdminAuth(patchHandler))
);
