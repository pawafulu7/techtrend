/**
 * Admin Articles API - 要約再生成
 *
 * POST /api/admin/articles/[id]/regenerate-summary
 * 指定記事の要約を AI で再生成し、DB を更新する
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import { prisma } from '@/lib/prisma';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { articleDetailCache } from '@/lib/cache/article-detail-cache';
import { getAppDependencies } from '@/lib/di/bootstrap';
import { normalizeArticleCategory } from '@/lib/utils/article/article-category-normalizer';
import { getTagIdsForConnect } from '@/lib/services/tag-service';
import logger from '@/lib/logger';
import { serializeArticleDetail } from '@/app/api/admin/articles/[id]/route';

export const dynamic = 'force-dynamic';

const idSchema = z.string().cuid();

async function handler(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const idParseResult = idSchema.safeParse(id);
  if (!idParseResult.success) {
    return NextResponse.json({ error: 'Invalid article ID' }, { status: 400 });
  }

  // 記事取得
  const article = await prisma.article.findUnique({
    where: { id },
    include: { source: true, tags: true },
  });

  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }

  if (!article.content || article.content.trim() === '') {
    return NextResponse.json(
      { error: 'Article has no content to summarize' },
      { status: 400 }
    );
  }

  try {
    // AI 要約生成
    const { service } = getAppDependencies();
    const result = await service.generateSummary({
      title: article.title,
      content: article.content,
      qualityThreshold: 40,
      articleId: id,
    });

    // タグ処理（既存タグとの重複除外）
    const existingTagNames = article.tags.map((tag) => tag.name);
    const resultTags = result.tags ?? [];
    const uniqueNewTags = [...new Set(resultTags)].filter(
      (tagName) => !existingTagNames.includes(tagName)
    );
    const tagConnections =
      uniqueNewTags.length > 0
        ? await getTagIdsForConnect(uniqueNewTags, { normalize: false })
        : [];

    // category 正規化
    const normalizedCategory = result.category
      ? normalizeArticleCategory(result.category)
      : undefined;

    const now = new Date();

    // DB 更新
    const updatedArticle = await prisma.article.update({
      where: { id },
      data: {
        summary: result.summary,
        detailedSummary: result.detailedSummary,
        articleType: 'unified',
        summaryVersion: result.summaryVersion,
        qualityScore: result.qualityScore,
        summaryComputedAt: now,
        qualityScoreComputedAt: now,
        summaryError: null,
        skipReason: null,
        ...(result.translatedTitle && {
          translatedTitle: result.translatedTitle,
        }),
        ...(normalizedCategory && { category: normalizedCategory }),
        ...(tagConnections.length > 0 && {
          tags: { connect: tagConnections },
        }),
      },
      include: {
        source: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true } },
      },
    });

    // キャッシュ無効化（best-effort: 失敗しても要約生成成功は維持）
    try {
      await cacheInvalidator.onArticleUpdated(id);
      await articleDetailCache.invalidateArticle(id);
    } catch (cacheError) {
      logger.error(
        { error: cacheError, articleId: id },
        '[AdminRegenerateSummaryAPI] Cache invalidation failed'
      );
    }

    logger.info(
      { articleId: id, qualityScore: result.qualityScore },
      '[AdminRegenerateSummaryAPI] Summary regenerated successfully'
    );

    return NextResponse.json(serializeArticleDetail(updatedArticle), {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    // エラー情報を DB に記録
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    await prisma.article.update({
      where: { id },
      data: { summaryError: errorMessage },
    });

    logger.error(
      { error, articleId: id },
      '[AdminRegenerateSummaryAPI] Failed to regenerate summary'
    );
    return NextResponse.json(
      { error: 'Failed to regenerate summary' },
      { status: 500 }
    );
  }
}

export const POST = withCSRFProtection(
  withRateLimit('admin:ai-generate', withAdminAuth(handler))
);
