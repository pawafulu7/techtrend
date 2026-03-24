/**
 * Admin Articles API - 記事詳細
 *
 * GET /api/admin/articles/[id] - 全フィールド含む記事詳細
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import type { AdminArticleDetail } from '@/app/admin/articles/_types';

export const dynamic = 'force-dynamic';

const idSchema = z.string().cuid();

async function handler(
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

    const response: AdminArticleDetail = {
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

    return NextResponse.json(response, {
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

export const GET = withAdminAuth(withRateLimit('admin:read', handler));
