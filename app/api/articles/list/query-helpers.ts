/**
 * Query helpers for lightweight articles list endpoint
 *
 * Handles WHERE clause construction, source/tag/search/date filtering,
 * and cursor pagination logic specific to the list route.
 *
 * Note: This is separate from app/api/articles/lib/query-builder.ts which
 * provides ArticleWhereClauseBuilder for the general articles API.
 * This module handles lightweight-specific filtering (e.g., content notIn whitespace patterns).
 */

import type { Prisma } from '@prisma/client';
import { normalizeArticleCategory } from '@/lib/utils/article/article-category-normalizer';
import {
  getDateRangeFilter,
  parseDateFromTo,
  getDateFieldForSort,
} from '@/app/lib/date-utils';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';

import { countCache } from './cache-config';

type ArticleWhereInput = Prisma.ArticleWhereInput;

/** Parameters parsed from search params for WHERE clause building */
export interface WhereClauseParams {
  sources: string | null;
  sourceId: string | null;
  excludeSources: string | null;
  tag: string | null;
  tags: string | null;
  tagMode: string;
  search: string | null;
  dateRange: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  readFilter: string | null;
  userId: string | undefined;
  category: string | null;
  excludeUnprocessed: boolean;
  excludeLowQuality: boolean;
  finalSortBy: string;
}

/**
 * Build the complete WHERE clause for the lightweight articles query
 */
export function buildWhereClause(params: WhereClauseParams): ArticleWhereInput {
  const where: ArticleWhereInput = {};

  // Exclude articles without content (matches home page behavior)
  if (!where.AND) {
    where.AND = [];
  } else if (!Array.isArray(where.AND)) {
    where.AND = [where.AND];
  }
  (where.AND as ArticleWhereInput[]).push({
    // Exclude articles without meaningful content.
    // Prisma does not support trim() in WHERE clauses, so we filter null
    // and empty string here, and additionally exclude common whitespace-only
    // patterns via notIn. The detail API (app/api/articles/[id]/route.ts)
    // applies content.trim() === '' check as a secondary guard, returning
    // 404 for any whitespace-only content that slips through.
    AND: [
      { content: { not: null } },
      { content: { notIn: ['', ' ', '\n', '\r\n', '\t', '  ', '\n\n'] } },
    ],
  });

  // Exclude articles without processed summaries
  if (params.excludeUnprocessed) {
    where.summaryComputedAt = { not: null };
  }

  // Exclude low quality articles
  if (params.excludeLowQuality) {
    const lowQualityFilters: ArticleWhereInput[] = [
      {
        OR: [
          { skipReason: null },
          {
            skipReason: {
              notIn: ['THIN_CONTENT' as const, 'QUALITY_FAILED' as const],
            },
          },
        ],
      },
      { qualityScore: { gte: 30 } },
    ];

    if (!where.AND) {
      where.AND = [];
    } else if (!Array.isArray(where.AND)) {
      where.AND = [where.AND];
    }
    where.AND = [...where.AND, ...lowQualityFilters];
  }

  // Apply read filter if user is authenticated
  applyReadFilter(where, params.readFilter, params.userId);

  // Apply source filter
  applySourceFilter(where, params.sources, params.sourceId);

  // Always filter to enabled sources only
  where.source = { enabled: true };

  // Apply exclude sources filter
  applyExcludeSourcesFilter(where, params.excludeSources);

  // Apply category filter with normalization
  applyCategoryFilter(where, params.category);

  // Apply tag filter
  applyTagFilter(where, params.tag, params.tags, params.tagMode);

  // Apply search filter
  applySearchFilter(where, params.search);

  // Apply date range filter
  applyDateRangeFilter(
    where,
    params.finalSortBy,
    params.dateRange,
    params.dateFrom,
    params.dateTo
  );

  return where;
}

function applyReadFilter(
  where: ArticleWhereInput,
  readFilter: string | null,
  userId: string | undefined
): void {
  if (readFilter && userId) {
    if (readFilter === 'unread') {
      where.articleViews = {
        none: {
          userId: userId,
          isRead: true,
        },
      };
    } else if (readFilter === 'read') {
      where.articleViews = {
        some: {
          userId: userId,
          isRead: true,
        },
      };
    }
  }
}

function parseSourceIds(
  sources: string | null,
  sourceId: string | null
): string[] {
  if (sources) {
    return sources
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const normalizedSourceId = sourceId?.trim();
  return normalizedSourceId ? [normalizedSourceId] : [];
}

function applySourceFilter(
  where: ArticleWhereInput,
  sources: string | null,
  sourceId: string | null
): void {
  if (sources || sourceId) {
    const normalizedSourcesValue = sources?.trim().toLowerCase();

    if (normalizedSourcesValue === 'none') {
      where.sourceId = { in: [] };
    } else if (normalizedSourcesValue !== 'all') {
      const sourceIds = parseSourceIds(sources, sourceId);

      if (sourceIds.length > 0) {
        where.sourceId = {
          in: sourceIds,
        };
      }
    }
  }
}

function applyExcludeSourcesFilter(
  where: ArticleWhereInput,
  excludeSources: string | null
): void {
  if (!excludeSources) return;

  const excludeIds = excludeSources
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (excludeIds.length === 0) return;

  const currentSourceId = where.sourceId;
  if (currentSourceId && typeof currentSourceId === 'object') {
    const existingNotIn =
      'notIn' in currentSourceId && Array.isArray(currentSourceId.notIn)
        ? currentSourceId.notIn
        : [];
    const mergedNotIn = [...new Set([...existingNotIn, ...excludeIds])];
    where.sourceId = {
      ...currentSourceId,
      notIn: mergedNotIn,
    };
  } else if (currentSourceId && typeof currentSourceId === 'string') {
    if (excludeIds.includes(currentSourceId)) {
      where.sourceId = { in: [] };
    }
  } else {
    where.sourceId = { notIn: excludeIds };
  }
}

function applyCategoryFilter(
  where: ArticleWhereInput,
  category: string | null
): void {
  if (category && category !== 'all') {
    if (category === 'uncategorized') {
      where.category = null;
    } else {
      const normalizedCategory = normalizeArticleCategory(category);
      if (normalizedCategory) {
        where.category = normalizedCategory;
      }
    }
  }
}

function applyTagFilter(
  where: ArticleWhereInput,
  tag: string | null,
  tags: string | null,
  tagMode: string
): void {
  if (!tag && !tags) return;

  const tagList = tags
    ? tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    : tag
      ? [tag]
      : [];

  if (tagList.length === 0) return;

  if (tagMode === 'AND') {
    const tagConditions: ArticleWhereInput[] = tagList.map((tagName) => ({
      tags: {
        some: {
          name: { equals: tagName, mode: 'insensitive' as const },
        },
      },
    }));
    if (!where.AND) {
      where.AND = [];
    } else if (!Array.isArray(where.AND)) {
      where.AND = [where.AND];
    }
    where.AND = [...where.AND, ...tagConditions];
  } else {
    where.tags = {
      some: {
        OR: tagList.map((tagName) => ({
          name: { equals: tagName, mode: 'insensitive' as const },
        })),
      },
    };
  }
}

function applySearchFilter(
  where: ArticleWhereInput,
  search: string | null
): void {
  if (!search) return;

  const keywords = search
    .trim()
    .split(/[\s\u3000]+/)
    .filter((k) => k.length > 0);

  if (keywords.length === 1) {
    where.OR = [
      { title: { contains: keywords[0], mode: 'insensitive' } },
      { summary: { contains: keywords[0], mode: 'insensitive' } },
    ];
  } else if (keywords.length > 1) {
    const keywordConditions: ArticleWhereInput[] = keywords.map((keyword) => ({
      OR: [
        { title: { contains: keyword, mode: 'insensitive' } },
        { summary: { contains: keyword, mode: 'insensitive' } },
      ],
    }));
    if (!where.AND) {
      where.AND = [];
    } else if (!Array.isArray(where.AND)) {
      where.AND = [where.AND];
    }
    where.AND = [...where.AND, ...keywordConditions];
  }
}

function applyDateRangeFilter(
  where: ArticleWhereInput,
  finalSortBy: string,
  dateRange: string | null,
  dateFrom: string | null,
  dateTo: string | null
): void {
  const dateField = getDateFieldForSort(finalSortBy);
  if (dateFrom || dateTo) {
    const customRange = parseDateFromTo(dateFrom, dateTo);
    if (customRange) {
      where[dateField] = {
        gte: customRange.from,
        lte: customRange.to,
      };
    } else {
      logger.warn(
        `articles-list.invalid-custom-date-range: Ignored invalid custom date range dateFrom=${dateFrom} dateTo=${dateTo}`
      );
    }
  } else if (dateRange && dateRange !== 'all') {
    const startDate = getDateRangeFilter(dateRange);
    if (startDate) {
      const now = new Date();
      const validStartDate = startDate > now ? now : startDate;
      where[dateField] = {
        gte: validStartDate,
        lte: now,
      };
    }
  }
}

/**
 * Normalize search string for cache key consistency
 */
export function normalizeSearchForCacheKey(search: string | null): string {
  return search
    ? search
        .trim()
        .split(/[\s\u3000]+/)
        .filter((k) => k.length > 0)
        .sort()
        .join(',')
    : 'none';
}

/**
 * Normalize sources string for cache key consistency
 */
export function normalizeSourcesForCacheKey(
  sources: string | null,
  sourceId: string | null
): string {
  if (sources) {
    const trimmedLower = sources.trim().toLowerCase();
    if (trimmedLower === 'all' || trimmedLower === 'none') {
      return trimmedLower;
    }
    const sourceIds = [...new Set(parseSourceIds(sources, null))].sort();
    return sourceIds.length > 0 ? sourceIds.join(',') : 'all';
  }
  const sourceIds = parseSourceIds(null, sourceId);
  return sourceIds.length > 0 ? sourceIds[0] : 'all';
}

/**
 * Normalize excludeSources string for cache key consistency
 */
export function normalizeExcludeSourcesForCacheKey(
  excludeSources: string | null
): string {
  if (!excludeSources) return 'none';
  const ids = parseSourceIds(excludeSources, null).sort();
  return ids.length > 0 ? ids.join(',') : 'none';
}

/** Parameters for fetching total count with caching */
export interface CountParams {
  where: ArticleWhereInput;
  normalizedSources: string;
  normalizedExcludeSources: string;
  tag: string | null;
  tags: string | null;
  tagMode: string;
  normalizedSearch: string;
  dateRange: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  finalSortBy: string;
  readFilter: string | null;
  category: string | null;
  userId: string | undefined;
  useCursor: boolean;
  page: number;
  limit: number;
  totalParam: string | null;
  excludeUnprocessed: boolean;
  excludeLowQuality: boolean;
}

/**
 * Fetch total count with caching and client-provided total optimization
 */
export async function fetchTotalCount(params: CountParams): Promise<number> {
  const isUserScopedCount =
    params.readFilter === 'read' || params.readFilter === 'unread';
  const countCacheKey = countCache.generateCacheKey('articles:count', {
    params: {
      sources: params.normalizedSources,
      excludeSources: params.normalizedExcludeSources,
      tag: params.tag || 'all',
      tags: params.tags || 'none',
      tagMode: params.tagMode,
      search: params.normalizedSearch,
      dateRange: params.dateRange || 'all',
      dateFrom: params.dateFrom || '',
      dateTo: params.dateTo || '',
      sortBy: params.finalSortBy,
      readFilter: params.readFilter || 'all',
      category: params.category || 'all',
      userId: isUserScopedCount ? (params.userId ?? 'anonymous') : 'n/a',
      excludeUnprocessed: params.excludeUnprocessed ? 'true' : 'false',
      excludeLowQuality: params.excludeLowQuality ? 'true' : 'false',
    },
  });

  // Quick Win 2: Use client-provided total only for offset pagination page >1
  if (!params.useCursor && params.page > 1 && params.totalParam) {
    const parsedTotal = Number.parseInt(params.totalParam, 10);
    if (
      !Number.isNaN(parsedTotal) &&
      parsedTotal >= (params.page - 1) * params.limit
    ) {
      return parsedTotal;
    }
  }

  const cachedCount = await countCache.get<number>(countCacheKey);
  if (cachedCount !== null && cachedCount !== undefined) {
    return cachedCount;
  }

  const countWhere = { ...params.where };
  const computedTotal = await prisma.article.count({ where: countWhere });
  await countCache.set(countCacheKey, computedTotal);
  return computedTotal;
}
