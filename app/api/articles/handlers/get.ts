/**
 * GET Handler for Articles API
 *
 * Handles article listing with pagination, filtering, caching,
 * personalization, and user-specific data overlays.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { ArticleWithRelations } from '@/types/models';
import { DatabaseError, formatErrorResponse } from '@/lib/errors';
import {
  LayeredCache,
  type ArticleQueryParams,
} from '@/lib/cache/layered-cache';
import { getSession } from '@/lib/auth/get-session';
import {
  MetricsCollector,
  withDbTiming,
  withCacheTiming,
} from '@/lib/metrics/performance';
import { getPeriodCutoffDate } from '@/lib/personalization/category-filter-service';
import logger from '@/lib/logger';

import {
  buildSelectFields,
  buildWhereClause,
  fetchUserSpecificData,
  mergeUserData,
  extractArticleIds,
  createGetResponse,
  createEmptyResponse,
  toArticleQueryParams,
  VALID_SORT_FIELDS,
  type ParsedQueryParams,
  type ArticleCacheParams,
  type ArticleQueryResult,
  type DisplayOptions,
  type FilterParams,
  type PaginationParams,
  type PersonalizationParams,
} from '../lib';
import {
  searchCacheKey,
  validateTagFilter,
} from '../lib/where-clause-predicates';
import { executePersonalizedQuery } from './personalized-query';

/** パーソナライズの期間（periodMonths）の上限（100 年） */
const MAX_PERIOD_MONTHS = 1200;

// Initialize Layered cache system for articles
const cache = new LayeredCache();

/**
 * Parse query parameters from request
 */
function parseQueryParams(request: NextRequest): ParsedQueryParams {
  const { searchParams } = new URL(request.url);

  // Parse pagination params with NaN protection
  const pageParam = searchParams.get('page');
  const limitParam = searchParams.get('limit');
  const parsedPage = Number.parseInt(pageParam ?? '1', 10);
  const parsedLimit = Number.parseInt(limitParam ?? '20', 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(100, Math.max(1, parsedLimit))
    : 20;

  // Parse sort parameters
  const sortByParam = searchParams.get('sortBy');
  const sortBy = sortByParam || 'publishedAt';
  const finalSortBy = VALID_SORT_FIELDS.includes(
    sortBy as (typeof VALID_SORT_FIELDS)[number]
  )
    ? sortBy
    : 'publishedAt';
  const rawSortOrderParam = searchParams.get('sortOrder');
  const rawSortOrder = (rawSortOrderParam || 'desc').toLowerCase();
  const sortOrder = (rawSortOrder === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

  // Parse filter parameters
  const sources = searchParams.get('sources') ?? undefined;
  const sourceId = searchParams.get('sourceId') ?? undefined;
  const tag = searchParams.get('tag') ?? undefined;
  const tags = searchParams.get('tags') ?? undefined;
  // AND 以外は OR にそろえる（任意の値ごとに別のキャッシュキーができるのを防ぐ）
  const tagMode =
    (searchParams.get('tagMode') || 'OR').toUpperCase() === 'AND'
      ? 'AND'
      : 'OR';
  const search = searchParams.get('search') ?? undefined;
  const dateRange = searchParams.get('dateRange') ?? undefined;
  const dateFrom = searchParams.get('dateFrom') ?? undefined;
  const dateTo = searchParams.get('dateTo') ?? undefined;
  const readFilter = searchParams.get('readFilter') ?? undefined;
  const category = searchParams.get('category') ?? undefined;
  // Low quality article filter - default false (new articles have qualityScore=0)
  const excludeLowQualityParam = searchParams.get('excludeLowQuality');
  const excludeLowQuality = excludeLowQualityParam === 'true';
  // 技術者向けでない記事は既定で外す（issue #722）
  const includeOffTopic = searchParams.get('includeOffTopic') === 'true';
  // Exclude specific sources (e.g., arXiv papers from home page)
  const excludeSources = searchParams.get('excludeSources') ?? undefined;

  // Parse display options
  const includeRelations = searchParams.get('includeRelations') === 'true';
  const includeEmptyContent =
    searchParams.get('includeEmptyContent') === 'true';
  const excludeUnprocessed = searchParams.get('excludeUnprocessed') === 'true';
  const lightweight = searchParams.get('lightweight') === 'true';
  const fields = searchParams.get('fields') ?? undefined;
  const includeUserData = searchParams.get('includeUserData') === 'true';

  // Parse personalization parameters
  const categoryIdsParam = searchParams.get('categoryIds');
  const categoryIds = categoryIdsParam
    ? categoryIdsParam
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    : [];
  const periodMonthsParam = searchParams.get('periodMonths');
  const parsedPeriodMonths = Number.parseInt(periodMonthsParam ?? '0', 10);
  // 上限は 100 年。期間の下限の日時が PostgreSQL の扱える範囲を外れると、推薦から
  // 切り替えた通常検索が 500 になるため（画面の選択肢は 0・3・6・12 か月）
  const periodMonths =
    Number.isFinite(parsedPeriodMonths) && parsedPeriodMonths >= 0
      ? Math.min(parsedPeriodMonths, MAX_PERIOD_MONTHS)
      : 0;

  // Normalize search keywords for consistent cache key（searchCacheKey の説明を参照）。
  // LayeredCache はキーを空白で区切り直すが、このキーは空白を含まないので 1 語のまま扱われる
  const normalizedSearch = searchCacheKey(search);

  // Normalize sources for cache key (trim first, then filter empty, then lowercase)
  const normalizedSources = sources
    ? sources
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .map((id) => id.toLowerCase())
        .sort()
        .join(',')
    : sourceId?.toLowerCase() || 'all';

  const pagination: PaginationParams = {
    page,
    limit,
    sortBy: finalSortBy as PaginationParams['sortBy'],
    sortOrder,
  };
  const filters: FilterParams = {
    sources,
    sourceId,
    excludeSources,
    tag,
    tags,
    tagMode,
    search,
    dateRange,
    dateFrom,
    dateTo,
    readFilter,
    category,
    excludeLowQuality,
    includeOffTopic,
  };
  const display: DisplayOptions = {
    includeRelations,
    includeEmptyContent,
    excludeUnprocessed,
    lightweight,
    fields,
    includeUserData,
  };
  const personalization: PersonalizationParams = { categoryIds, periodMonths };

  return {
    pagination,
    filters,
    display,
    personalization,
    normalizedSearch,
    normalizedSources,
  };
}

/**
 * 通常検索の並べ替えの列。Article に finalScore 列はない（推薦のスコア）ので公開日で並べる
 */
function standardSortBy(
  sortBy: PaginationParams['sortBy']
): Exclude<PaginationParams['sortBy'], 'finalScore'> {
  return sortBy === 'finalScore' ? 'publishedAt' : sortBy;
}

/**
 * Build cache parameters from parsed query params
 */
function buildCacheParams(
  params: ParsedQueryParams,
  userId: string | undefined,
  hasUserScopedQuery: boolean
): ArticleCacheParams {
  const { pagination, filters, display, normalizedSearch, normalizedSources } =
    params;

  return {
    page: pagination.page,
    limit: pagination.limit,
    sortBy: standardSortBy(pagination.sortBy),
    sortOrder: pagination.sortOrder,
    sources: normalizedSources,
    sourceId: filters.sourceId?.toLowerCase(),
    excludeSources: filters.excludeSources,
    tag: filters.tag,
    tags: filters.tags,
    tagMode: filters.tagMode,
    search: normalizedSearch === 'none' ? undefined : normalizedSearch,
    dateRange: filters.dateRange,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    readFilter: userId ? filters.readFilter : undefined,
    userId: hasUserScopedQuery ? userId : undefined,
    category: filters.category,
    includeRelations: display.includeRelations,
    includeEmptyContent: display.includeEmptyContent,
    excludeUnprocessed: display.excludeUnprocessed,
    excludeLowQuality: filters.excludeLowQuality !== false,
    includeOffTopic: filters.includeOffTopic === true,
    lightweight: display.lightweight,
    fields: display.fields,
    includeUserData: false,
  };
}

/**
 * Execute standard article query with caching
 *
 * @param publishedAfter - パーソナライズから切り替えたときの期間の下限（`periodMonths`）。
 *   件数キャッシュのキーに期間が入らないので、指定時は件数キャッシュを通さずに数える
 */
async function executeStandardQuery(
  params: ParsedQueryParams,
  userId: string | undefined,
  hasUserScopedQuery: boolean,
  metrics: MetricsCollector,
  publishedAfter?: Date | null
): Promise<ArticleQueryResult> {
  const { pagination, filters, display } = params;
  const { page, limit, sortOrder } = pagination;
  const sortBy = standardSortBy(pagination.sortBy);

  // Early return for explicit 'none' filter
  if (filters.sources === 'none') {
    return createEmptyResponse(page, limit);
  }

  // Build where clause
  const { where: filterWhere, emptyResult } = await buildWhereClause(
    filters,
    display,
    userId,
    metrics,
    sortBy
  );
  const where = publishedAfter
    ? { AND: [filterWhere, { publishedAt: { gte: publishedAfter } }] }
    : filterWhere;

  if (emptyResult) {
    return createEmptyResponse(page, limit);
  }

  // Build select fields
  const selectFields = buildSelectFields(display);

  // Build cache params for count caching (sortBy affects date filters)
  const cacheParams = buildCacheParams(params, userId, hasUserScopedQuery);

  // Execute count (via cache when possible) and findMany in parallel
  const [total, articles] = await withDbTiming(
    metrics,
    () =>
      Promise.all([
        hasUserScopedQuery || publishedAfter
          ? prisma.article.count({ where })
          : cache
              .getArticleCount(toArticleQueryParams(cacheParams), async () => {
                const total = await prisma.article.count({ where });
                return { total };
              })
              .then(({ total }) => total),
        prisma.article.findMany({
          where,
          select: selectFields,
          orderBy: [{ [sortBy]: sortOrder }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]),
    'db_query'
  );

  return {
    items: articles as ArticleWithRelations[],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Main GET handler for articles
 */
export async function handleGet(request: NextRequest): Promise<NextResponse> {
  const metrics = new MetricsCollector();

  try {
    // Parse query parameters
    const params = parseQueryParams(request);
    const { pagination, filters, display, personalization } = params;
    const { page, limit } = pagination;

    // タグの数と長さを検証する（キャッシュキーを作る前・タグを解決する前）
    const tagFilterError = validateTagFilter(filters.tag, filters.tags);
    if (tagFilterError) {
      return NextResponse.json(
        { success: false, error: tagFilterError },
        { status: 400 }
      );
    }

    // Check if user session is required
    const requiresUserSession =
      filters.readFilter === 'read' ||
      filters.readFilter === 'unread' ||
      display.includeUserData;
    const session = requiresUserSession ? await getSession() : null;
    const userId = session?.user?.id;

    // Return 401 if readFilter is used without authentication
    if (
      (filters.readFilter === 'read' || filters.readFilter === 'unread') &&
      !userId
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required for read filter',
        },
        { status: 401 }
      );
    }

    const hasUserScopedQuery =
      (filters.readFilter === 'read' || filters.readFilter === 'unread') &&
      !!userId;
    const hasUserContext =
      (display.includeUserData && !!userId) || hasUserScopedQuery;
    // Personalization does not support readFilter - skip personalization when readFilter is active
    const shouldUsePersonalizedFilter =
      personalization.categoryIds.length > 0 && !hasUserScopedQuery;

    // Execute query
    let baseResult: ArticleQueryResult;

    if (shouldUsePersonalizedFilter) {
      // Try personalized query first
      const personalizedResult = await executePersonalizedQuery(
        params,
        metrics
      );
      if (personalizedResult) {
        baseResult = personalizedResult;
      } else {
        // Fall back to standard query（推薦の期間 periodMonths は保つ）
        baseResult = await executeStandardQuery(
          params,
          userId,
          hasUserScopedQuery,
          metrics,
          getPeriodCutoffDate(personalization.periodMonths)
        );
      }
    } else {
      // Standard query with caching
      const cacheParams = buildCacheParams(params, userId, hasUserScopedQuery);

      if (hasUserScopedQuery) {
        // User-scoped queries bypass cache
        baseResult = await executeStandardQuery(
          params,
          userId,
          hasUserScopedQuery,
          metrics
        );
      } else {
        // Use cache
        const cacheResult = await withCacheTiming(
          metrics,
          () =>
            cache.getArticles(cacheParams as ArticleQueryParams, () =>
              executeStandardQuery(params, userId, hasUserScopedQuery, metrics)
            ),
          'cache_articles'
        );
        baseResult = cacheResult ?? createEmptyResponse(page, limit);
      }
    }

    // Merge user data if needed
    let result = baseResult;

    if (display.includeUserData && userId && baseResult?.items?.length > 0) {
      const bypassFavoriteL1 = Boolean(
        request.cookies.get('tt_fav_bust')?.value
      );
      const articleIds = extractArticleIds(baseResult.items);
      const userSpecificData = await fetchUserSpecificData(
        userId,
        articleIds,
        metrics,
        {
          bypassFavoriteL1,
        }
      );

      result = {
        ...baseResult,
        items: mergeUserData(baseResult.items, userSpecificData),
      };
    }

    // Create response
    return createGetResponse(result, {
      includeUserData: display.includeUserData,
      hasUserId: !!userId,
      cacheOptions: {
        isUserDependent: hasUserContext,
        hasPersonalization: shouldUsePersonalizedFilter,
        hasAuthorization: !!request.headers.get('Authorization'),
      },
      metrics,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching articles');
    // 元の例外の文言は応答に入れない（DB のエラー文が漏れるため。issue #687）。原因は上のログで追う
    const dbError = new DatabaseError('Failed to fetch articles', 'select');

    const errorResponse = formatErrorResponse(dbError);
    return NextResponse.json(errorResponse, { status: dbError.statusCode });
  }
}
