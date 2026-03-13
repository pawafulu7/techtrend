/**
 * Response builder for lightweight articles list endpoint
 *
 * Handles article normalization, company name enrichment,
 * cursor/offset pagination info generation, and user data merging.
 */

import { createLoaders } from '@/lib/dataloader';
import { getCursorManager } from '@/lib/pagination/cursor-manager';
import type { PaginatedResponse } from '@/lib/types/api';
import logger from '@/lib/logger';

import type { LightweightArticle } from './types';
import { mergeUserDataIntoItems } from './types';
import type { ListSortField } from './query-helpers';

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
  tags?: Array<{ name: string }>;
  [key: string]: any;
};

/**
 * Extract company names for hatena_blog_dev articles from already-fetched tag data.
 * Pure function - no DB query needed since tags are included in the main article query.
 */
export function extractCompanyNames(
  articles: Array<{
    id: string;
    sourceId: string;
    tags?: Array<{ name: string }>;
  }>,
  limit: number
): Map<string, string> {
  const companyNameMap = new Map<string, string>();
  const companyPattern = /株式会社|合同会社|有限会社/;

  for (const article of articles.slice(0, limit)) {
    if (article.sourceId !== 'hatena_blog_dev' || !article.tags) continue;
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

/** Common parameters shared by cursor and offset pagination builders */
interface BasePaginationParams {
  articles: RawArticle[];
  total: number;
  limit: number;
  finalSortBy: ListSortField;
  sortOrder: 'asc' | 'desc';
  normalizedSources: string;
  tags: string | null;
  tag: string | null;
  tagMode: string;
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

/** Parameters for building cursor pagination result */
export interface CursorPaginationParams extends BasePaginationParams {
  hasPreviousPage: boolean;
}

/** Filter context for cursor encoding and validation */
export interface FilterContext {
  [key: string]: string | null;
  sources: string;
  tags: string | null;
  tagMode: string;
  search: string | null;
  dateRange: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  readFilter: string | null;
  category: string | null;
  excludeSources: string;
  excludeUnprocessed: 'true' | 'false';
  excludeLowQuality: 'true' | 'false';
}

/** Input parameters for buildFilterContext */
export interface FilterContextInput {
  normalizedSources: string;
  tags: string | null;
  tag: string | null;
  tagMode: string;
  search: string | null;
  dateRange: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  readFilter: string | null;
  category: string | null;
  excludeSources: string;
  excludeUnprocessed: boolean;
  excludeLowQuality: boolean;
}

/**
 * Build the filter context object shared by cursor validation and pagination results.
 * Used for cursor encoding, pageInfo generation, and filter-change detection.
 */
export function buildFilterContext(params: FilterContextInput): FilterContext {
  return {
    sources: params.normalizedSources,
    tags: params.tags || params.tag,
    tagMode: params.tagMode,
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
    buildFilterContext(params),
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
export interface OffsetPaginationParams extends BasePaginationParams {
  page: number;
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

    const filterContext = buildFilterContext(params);

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
 * Load favorite and read status maps for a list of article IDs.
 * Returns empty maps if loaders are not available (unauthenticated or missing userId).
 */
async function loadUserDataMaps(
  articleIds: string[],
  userId: string,
  bypassFavoriteL1: boolean
): Promise<{
  favoritesMap: Map<string, boolean>;
  readStatusMap: Map<string, boolean>;
}> {
  if (articleIds.length === 0) {
    return { favoritesMap: new Map(), readStatusMap: new Map() };
  }

  const loaders = createLoaders(
    { userId },
    { favorite: { bypassL1: bypassFavoriteL1 } }
  );

  if (!loaders.favorite || !loaders.view) {
    return { favoritesMap: new Map(), readStatusMap: new Map() };
  }

  const [favoriteStatuses, viewStatuses] = await Promise.all([
    loaders.favorite.loadMany(articleIds),
    loaders.view.loadMany(articleIds),
  ]);

  const favoriteError = favoriteStatuses.find(
    (status): status is Error => status instanceof Error
  );
  if (favoriteError) {
    throw favoriteError;
  }

  const viewError = viewStatuses.find(
    (status): status is Error => status instanceof Error
  );
  if (viewError) {
    throw viewError;
  }

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

  return { favoritesMap, readStatusMap };
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
    `DataLoader integration: isAuthenticated=${Boolean(userId)}, articles=${articleIds.length}`
  );

  const { favoritesMap, readStatusMap } = await loadUserDataMaps(
    articleIds,
    userId,
    bypassFavoriteL1
  );

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

  const { favoritesMap, readStatusMap } = await loadUserDataMaps(
    articleIds,
    userId,
    bypassFavoriteL1
  );

  return {
    ...result,
    items: mergeUserDataIntoItems(result.items, favoritesMap, readStatusMap),
  };
}
