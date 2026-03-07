/**
 * Response builder for lightweight articles list endpoint
 *
 * Handles article normalization, company name enrichment,
 * cursor/offset pagination info generation, and user data merging.
 */

import { prisma } from '@/lib/prisma';
import { createLoaders } from '@/lib/dataloader';
import { getCursorManager } from '@/lib/pagination/cursor-manager';
import type { PaginatedResponse } from '@/lib/types/api';
import logger from '@/lib/logger';

import type { LightweightArticle } from './types';
import { mergeUserDataIntoItems } from './types';

/** Raw article row from Prisma query (before normalization) */
type RawArticle = {
  id: string;
  title: string;
  translatedTitle: string | null;
  url: string;
  summary: string | null;
  thumbnail: string | null;
  publishedAt: Date;
  sourceId: string;
  source: { id: string; name: string; type: string; url: string };
  category: any;
  qualityScore: number;
  bookmarks: number;
  userVotes: number;
  createdAt: Date;
  updatedAt: Date;
  contentLength: number | null;
  [key: string]: any;
};

/**
 * Fetch company names for hatena_blog_dev articles (batch query)
 */
export async function fetchCompanyNames(
  articles: RawArticle[],
  limit: number
): Promise<Map<string, string>> {
  const companyNameMap = new Map<string, string>();
  const hatenaArticleIds = articles
    .slice(0, limit)
    .filter((a) => a.sourceId === 'hatena_blog_dev')
    .map((a) => a.id);

  if (hatenaArticleIds.length === 0) return companyNameMap;

  const hatenaArticlesWithTags = await prisma.article.findMany({
    where: { id: { in: hatenaArticleIds } },
    select: {
      id: true,
      tags: { select: { name: true } },
    },
  });

  const companyPattern = /株式会社|合同会社|有限会社/;
  for (const article of hatenaArticlesWithTags) {
    const companyTag = article.tags.find((t) => companyPattern.test(t.name));
    if (companyTag) {
      companyNameMap.set(article.id, companyTag.name);
    }
  }

  return companyNameMap;
}

/**
 * Normalize a single article (Date -> ISO string, add companyName)
 */
function normalizeArticle(
  article: RawArticle,
  companyNameMap: Map<string, string>
): LightweightArticle {
  const normalized: LightweightArticle = {
    ...article,
    publishedAt:
      article.publishedAt instanceof Date
        ? article.publishedAt.toISOString()
        : article.publishedAt,
    createdAt:
      article.createdAt instanceof Date
        ? article.createdAt.toISOString()
        : article.createdAt,
    updatedAt:
      article.updatedAt instanceof Date
        ? article.updatedAt.toISOString()
        : article.updatedAt,
  };

  const companyName = companyNameMap.get(article.id);
  if (companyName) {
    normalized.companyName = companyName;
  }

  return normalized;
}

/** Parameters for building cursor pagination result */
export interface CursorPaginationParams {
  articles: RawArticle[];
  total: number;
  limit: number;
  finalSortBy: string;
  sortOrder: 'asc' | 'desc';
  normalizedSources: string;
  tags: string | null;
  tag: string | null;
  search: string | null;
  dateRange: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  readFilter: string | null;
  category: string | null;
  hasPreviousPage: boolean;
  companyNameMap: Map<string, string>;
  excludeSources: string;
  excludeUnprocessed: boolean;
  excludeLowQuality: boolean;
}

/**
 * Build cursor-based pagination result
 */
export function buildCursorResult(
  params: CursorPaginationParams
): PaginatedResponse<LightweightArticle> {
  const cursorManager = getCursorManager();

  const pageData = cursorManager.generatePageInfo(
    params.articles,
    params.limit,
    params.finalSortBy,
    params.sortOrder,
    {
      sources: params.normalizedSources,
      tags: params.tags || params.tag,
      search: params.search,
      dateRange: params.dateRange,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      readFilter: params.readFilter,
      category: params.category,
      excludeSources: params.excludeSources,
      excludeUnprocessed: params.excludeUnprocessed ? 'true' : 'false',
      excludeLowQuality: params.excludeLowQuality ? 'true' : 'false',
    },
    params.hasPreviousPage
  );

  const pageInfo = {
    hasNextPage: pageData.hasNextPage,
    hasPreviousPage: pageData.hasPreviousPage,
    startCursor: pageData.startCursor,
    endCursor: pageData.endCursor,
  };

  const normalizedArticles = pageData.items.map((article) =>
    normalizeArticle(article as RawArticle, params.companyNameMap)
  );

  return {
    items: normalizedArticles,
    total: params.total,
    pageInfo,
    page: 1,
    limit: params.limit,
    totalPages: Math.ceil(params.total / params.limit),
  };
}

/** Parameters for building offset pagination result */
export interface OffsetPaginationParams {
  articles: RawArticle[];
  total: number;
  page: number;
  limit: number;
  finalSortBy: string;
  sortOrder: 'asc' | 'desc';
  normalizedSources: string;
  tags: string | null;
  tag: string | null;
  search: string | null;
  dateRange: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  readFilter: string | null;
  category: string | null;
  companyNameMap: Map<string, string>;
  excludeSources: string;
  excludeUnprocessed: boolean;
  excludeLowQuality: boolean;
}

/**
 * Build offset-based pagination result (with cursor info for transition)
 */
export function buildOffsetResult(
  params: OffsetPaginationParams
): PaginatedResponse<LightweightArticle> {
  const cursorManager = getCursorManager();

  const normalizedArticles = params.articles.map((article) =>
    normalizeArticle(article, params.companyNameMap)
  );

  let pageInfo: PaginatedResponse<LightweightArticle>['pageInfo'] = undefined;
  if (params.articles.length > 0) {
    const hasNextPage = params.page < Math.ceil(params.total / params.limit);
    const hasPreviousPage = params.page > 1;

    const firstItem = params.articles[0];
    const lastItem = params.articles[params.articles.length - 1];

    const filterContext = {
      sources: params.normalizedSources,
      tags: params.tags || params.tag,
      search: params.search,
      dateRange: params.dateRange,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      readFilter: params.readFilter,
      category: params.category,
      excludeSources: params.excludeSources,
      excludeUnprocessed: params.excludeUnprocessed ? 'true' : 'false',
      excludeLowQuality: params.excludeLowQuality ? 'true' : 'false',
    };

    const startCursor = cursorManager.encodeCursor({
      sortBy: params.finalSortBy,
      sortOrder: params.sortOrder,
      values: {
        [params.finalSortBy]: firstItem[params.finalSortBy],
        id: firstItem.id,
      },
      limit: params.limit,
      filters: filterContext,
    });

    const endCursor = cursorManager.encodeCursor({
      sortBy: params.finalSortBy,
      sortOrder: params.sortOrder,
      values: {
        [params.finalSortBy]: lastItem[params.finalSortBy],
        id: lastItem.id,
      },
      limit: params.limit,
      filters: filterContext,
    });

    pageInfo = {
      hasNextPage,
      hasPreviousPage,
      startCursor,
      endCursor,
    };
  }

  return {
    items: normalizedArticles,
    total: params.total,
    page: params.page,
    limit: params.limit,
    totalPages: Math.ceil(params.total / params.limit),
    pageInfo,
  };
}

/**
 * Fetch and merge user-specific data (favorites, read status) into articles
 */
export async function fetchAndMergeUserData(
  items: LightweightArticle[],
  userId: string,
  bypassFavoriteL1: boolean
): Promise<LightweightArticle[]> {
  const articleIds = items.map((a) => a.id);

  logger.debug(
    `DataLoader integration: userId=${userId}, articles=${articleIds.length}`
  );

  const loaders = createLoaders(
    { userId },
    { favorite: { bypassL1: bypassFavoriteL1 } }
  );

  if (!loaders.favorite || !loaders.view) {
    return items;
  }

  const [favoriteStatuses, viewStatuses] = await Promise.all([
    loaders.favorite.loadMany(articleIds),
    loaders.view.loadMany(articleIds),
  ]);

  logger.debug(
    `DataLoader results: favorites=${favoriteStatuses.length}, views=${viewStatuses.length}`
  );

  const favoritesMap = new Map<string, boolean>();
  const readStatusMap = new Map<string, boolean>();

  favoriteStatuses.forEach((status) => {
    if (status && typeof status === 'object' && 'isFavorited' in status) {
      favoritesMap.set(status.articleId, status.isFavorited);
    }
  });

  viewStatuses.forEach((status) => {
    if (status && typeof status === 'object' && 'isRead' in status) {
      readStatusMap.set(status.articleId, status.isRead);
    }
  });

  logger.debug(
    `DataLoader maps: favorites=${favoritesMap.size}, reads=${readStatusMap.size}`
  );

  return mergeUserDataIntoItems(items, favoritesMap, readStatusMap);
}

/**
 * Merge user data into a cached result (for cache HIT path)
 */
export async function mergeUserDataIntoCachedResult(
  result: PaginatedResponse<LightweightArticle>,
  userId: string,
  bypassFavoriteL1: boolean
): Promise<PaginatedResponse<LightweightArticle>> {
  const articleIds = result.items.map((a) => a.id);
  const loaders = createLoaders(
    { userId },
    { favorite: { bypassL1: bypassFavoriteL1 } }
  );

  if (!loaders.favorite || !loaders.view) {
    return result;
  }

  const [favoriteStatuses, viewStatuses] = await Promise.all([
    loaders.favorite.loadMany(articleIds),
    loaders.view.loadMany(articleIds),
  ]);

  const favoritesMap = new Map<string, boolean>();
  const readStatusMap = new Map<string, boolean>();

  favoriteStatuses.forEach((status) => {
    if (status && typeof status === 'object' && 'isFavorited' in status) {
      favoritesMap.set(status.articleId, status.isFavorited);
    }
  });

  viewStatuses.forEach((status) => {
    if (status && typeof status === 'object' && 'isRead' in status) {
      readStatusMap.set(status.articleId, status.isRead);
    }
  });

  return {
    ...result,
    items: mergeUserDataIntoItems(result.items, favoritesMap, readStatusMap),
  };
}
