/**
 * Admin Articles API - 記事一覧
 *
 * GET /api/admin/articles - ページネーション・フィルタ・検索付き記事一覧 + 品質集計
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import type { Prisma } from '@/lib/prisma-exports';
import {
  QUALITY_STATUS_VALUES,
  type AdminArticlesResponse,
  type AdminArticleListItem,
  type QualitySummary,
  type QualityStatus,
} from '@/app/admin/articles/_types';

export const dynamic = 'force-dynamic';

const ARTICLE_CATEGORY_VALUES = [
  'frontend',
  'backend',
  'ai_ml',
  'security',
  'devops',
  'database',
  'mobile',
  'web3',
  'design',
  'testing',
  'performance',
  'architecture',
] as const;

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  sourceId: z.string().optional(),
  category: z.enum(ARTICLE_CATEGORY_VALUES).optional(),
  qualityStatus: z.enum(QUALITY_STATUS_VALUES).optional(),
  query: z.string().max(200).optional(),
  visibility: z.enum(['all', 'visible', 'hidden']).optional(),
});

function buildQualityStatusWhere(
  status: QualityStatus
): Prisma.ArticleWhereInput {
  switch (status) {
    case 'missing_summary':
      return { OR: [{ summary: null }, { summary: '' }] };
    case 'missing_category':
      return { category: null };
    case 'missing_content':
      return { OR: [{ contentLength: null }, { contentLength: 0 }] };
    case 'low_quality':
      return {
        AND: [{ qualityScore: { gt: 0 } }, { qualityScore: { lt: 30 } }],
      };
    case 'has_error':
      return { summaryError: { not: null } };
    case 'skipped':
      return { skipReason: { not: null } };
  }
}

function buildSearchWhere(query: string): Prisma.ArticleWhereInput {
  return {
    OR: [
      { title: { contains: query, mode: 'insensitive' } },
      { translatedTitle: { contains: query, mode: 'insensitive' } },
      { summary: { contains: query, mode: 'insensitive' } },
    ],
  };
}

async function handler(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawParams = {
      page: searchParams.get('page') ?? undefined,
      perPage: searchParams.get('perPage') ?? undefined,
      sourceId: searchParams.get('sourceId') ?? undefined,
      category: searchParams.get('category') ?? undefined,
      qualityStatus: searchParams.get('qualityStatus') ?? undefined,
      query: searchParams.get('query') ?? undefined,
      visibility: searchParams.get('visibility') ?? undefined,
    };

    const parseResult = querySchema.safeParse(rawParams);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const {
      page,
      perPage,
      sourceId,
      category,
      qualityStatus,
      query,
      visibility,
    } = parseResult.data;

    // Build WHERE clause
    const where: Prisma.ArticleWhereInput = {};
    const conditions: Prisma.ArticleWhereInput[] = [];

    if (sourceId) {
      conditions.push({ sourceId });
    }
    if (category) {
      conditions.push({ category });
    }
    if (qualityStatus) {
      conditions.push(buildQualityStatusWhere(qualityStatus as QualityStatus));
    }
    if (query) {
      conditions.push(buildSearchWhere(query));
    }
    if (visibility === 'visible') {
      conditions.push({ isHidden: false });
    } else if (visibility === 'hidden') {
      conditions.push({ isHidden: true });
    }

    if (conditions.length > 0) {
      where.AND = conditions;
    }

    // Execute queries in parallel
    const [articles, totalCount, qualitySummary, sources] = await Promise.all([
      prisma.article.findMany({
        where,
        select: {
          id: true,
          title: true,
          translatedTitle: true,
          url: true,
          publishedAt: true,
          sourceId: true,
          source: { select: { name: true } },
          category: true,
          qualityScore: true,
          summary: true,
          contentLength: true,
          skipReason: true,
          summaryError: true,
          bookmarks: true,
          isHidden: true,
        },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      prisma.article.count({ where }),
      getQualitySummary(),
      prisma.source.findMany({
        where: { enabled: true },
        select: { id: true, name: true, enabled: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const articleItems: AdminArticleListItem[] = articles.map((a) => ({
      id: a.id,
      title: a.title,
      translatedTitle: a.translatedTitle,
      url: a.url,
      publishedAt: a.publishedAt.toISOString(),
      sourceName: a.source.name,
      sourceId: a.sourceId,
      category: a.category,
      qualityScore: a.qualityScore,
      hasSummary: a.summary != null && a.summary !== '',
      hasContent: a.contentLength != null && a.contentLength > 0,
      skipReason: a.skipReason,
      hasSummaryError: a.summaryError != null,
      bookmarks: a.bookmarks,
      isHidden: a.isHidden,
    }));

    const response: AdminArticlesResponse = {
      articles: articleItems,
      totalCount,
      qualitySummary,
      sources,
      page,
      perPage,
      totalPages: Math.ceil(totalCount / perPage),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    logger.error({ error }, '[AdminArticlesAPI] Failed to fetch articles');
    return NextResponse.json(
      { error: 'Failed to fetch articles' },
      { status: 500 }
    );
  }
}

async function getQualitySummary(): Promise<QualitySummary> {
  const [
    totalArticles,
    missingSummary,
    missingCategory,
    missingContent,
    lowQuality,
    hasError,
    skipped,
    hidden,
  ] = await Promise.all([
    prisma.article.count(),
    prisma.article.count({ where: buildQualityStatusWhere('missing_summary') }),
    prisma.article.count({
      where: buildQualityStatusWhere('missing_category'),
    }),
    prisma.article.count({ where: buildQualityStatusWhere('missing_content') }),
    prisma.article.count({ where: buildQualityStatusWhere('low_quality') }),
    prisma.article.count({ where: buildQualityStatusWhere('has_error') }),
    prisma.article.count({ where: buildQualityStatusWhere('skipped') }),
    prisma.article.count({ where: { isHidden: true } }),
  ]);

  return {
    totalArticles,
    missingSummary,
    missingCategory,
    missingContent,
    lowQuality,
    hasError,
    skipped,
    hidden,
  };
}

export const GET = withAdminAuth(withRateLimit('admin:read', handler));
