/**
 * Admin Articles API - 記事詳細
 *
 * GET  /api/admin/articles/[id] - 全フィールド含む記事詳細
 * PATCH /api/admin/articles/[id] - 記事の isHidden フラグを更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import { prisma } from '@/lib/prisma';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { articleDetailCache } from '@/lib/cache/article-detail-cache';
import logger from '@/lib/logger';
import type { AdminArticleDetail } from '@/app/admin/articles/_types';

export const dynamic = 'force-dynamic';

const idSchema = z.string().cuid();

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
    hasSummary: article.summary != null && article.summary !== '',
    hasContent: article.content != null && article.content !== '',
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
    logger.error({ error }, '[AdminArticleDetailAPI] Failed to fetch article');
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
          { error: 'Validation failed', details: error.errors },
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

    // キャッシュ無効化（isHidden 変更時は関連記事キャッシュも無効化）
    await cacheInvalidator.onArticleUpdated(id);
    await articleDetailCache.invalidateArticle(id);
    await articleDetailCache.invalidateAllRelated();

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
    logger.error({ error }, '[AdminArticleDetailAPI] Failed to update article');
    return NextResponse.json(
      { error: 'Failed to update article' },
      { status: 500 }
    );
  }
}

export const GET = withAdminAuth(withRateLimit('admin:read', getHandler));
export const PATCH = withCSRFProtection(
  withRateLimit('admin:write', withAdminAuth(patchHandler))
);
