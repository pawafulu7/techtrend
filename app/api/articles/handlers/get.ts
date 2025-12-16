/**
 * GET Handler for Articles API
 *
 * Handles article listing with pagination, filtering, caching,
 * personalization, and user-specific data overlays.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import type { ArticleWithRelations } from '@/types/models';
import { DatabaseError, formatErrorResponse } from '@/lib/errors';
import { LayeredCache, type ArticleQueryParams } from '@/lib/cache/layered-cache';
import { auth } from '@/lib/auth/auth';
import { MetricsCollector, withDbTiming, withCacheTiming } from '@/lib/metrics/performance';
import { categoryFilterService } from '@/lib/personalization/category-filter-service';
import type { PersonalizedFilterOptions, PersonalizedSortBy } from '@/lib/personalization/types';
import logger from '@/lib/logger';

import {
  buildSelectFields,
  buildWhereClause,
  fetchUserSpecificData,
  mergeUserData,
  extractArticleIds,
  createGetResponse,
  createEmptyResponse,
  VALID_SORT_FIELDS,
  type ParsedQueryParams,
  type ArticleCacheParams,
  type ArticleQueryResult,
  type DisplayOptions,
  type FilterParams,
  type PaginationParams,
  type PersonalizationParams,
} from '../lib';

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
  const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 20;

  // Parse sort parameters
  const sortByParam = searchParams.get('sortBy');
  const sortBy = sortByParam || 'publishedAt';
  const finalSortBy = VALID_SORT_FIELDS.includes(sortBy as (typeof VALID_SORT_FIELDS)[number])
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
  const tagMode = (searchParams.get('tagMode') || 'OR').toUpperCase();
  const search = searchParams.get('search') ?? undefined;
  const dateRange = searchParams.get('dateRange') ?? undefined;
  const readFilter = searchParams.get('readFilter') ?? undefined;
  const category = searchParams.get('category') ?? undefined;

  // Parse display options
  const includeRelations = searchParams.get('includeRelations') === 'true';
  const includeEmptyContent = searchParams.get('includeEmptyContent') === 'true';
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
  const periodMonths =
    Number.isFinite(parsedPeriodMonths) && parsedPeriodMonths >= 0 ? parsedPeriodMonths : 0;

  // Normalize search keywords for consistent cache key
  const normalizedSearch = search
    ? search
        .trim()
        .split(/[\s\u3000]+/)
        .filter((k) => k.length > 0)
        .sort()
        .join(',')
    : 'none';

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

  const pagination: PaginationParams = { page, limit, sortBy: finalSortBy as PaginationParams['sortBy'], sortOrder };
  const filters: FilterParams = {
    sources,
    sourceId,
    tag,
    tags,
    tagMode,
    search,
    dateRange,
    readFilter,
    category,
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
 * Build cache parameters from parsed query params
 */
function buildCacheParams(
  params: ParsedQueryParams,
  userId: string | undefined,
  hasUserScopedQuery: boolean
): ArticleCacheParams {
  const { pagination, filters, display, normalizedSearch, normalizedSources } = params;

  return {
    page: pagination.page,
    limit: pagination.limit,
    sortBy: pagination.sortBy,
    sortOrder: pagination.sortOrder,
    sources: normalizedSources,
    sourceId: filters.sourceId?.toLowerCase(),
    tag: filters.tag,
    tags: filters.tags,
    tagMode: filters.tagMode,
    search: normalizedSearch === 'none' ? undefined : normalizedSearch,
    dateRange: filters.dateRange,
    readFilter: userId ? filters.readFilter : undefined,
    userId: hasUserScopedQuery ? userId : undefined,
    category: filters.category,
    includeRelations: display.includeRelations,
    includeEmptyContent: display.includeEmptyContent,
    excludeUnprocessed: display.excludeUnprocessed,
    lightweight: display.lightweight,
    fields: display.fields,
    includeUserData: false,
  };
}

/**
 * Execute standard article query with caching
 */
async function executeStandardQuery(
  params: ParsedQueryParams,
  userId: string | undefined,
  hasUserScopedQuery: boolean,
  metrics: MetricsCollector
): Promise<ArticleQueryResult> {
  const { pagination, filters, display } = params;
  const { page, limit, sortBy, sortOrder } = pagination;

  // Early return for explicit 'none' filter
  if (filters.sources === 'none') {
    return createEmptyResponse(page, limit);
  }

  // Build where clause
  const { where, emptyResult } = await buildWhereClause(filters, display, userId, metrics);

  if (emptyResult) {
    return createEmptyResponse(page, limit);
  }

  // Build select fields
  const selectFields = buildSelectFields(display);

  // Build cache params for count caching (exclude sort/page in cache key)
  const cacheParams = buildCacheParams(params, userId, hasUserScopedQuery);

  // Execute count (via cache when possible) and findMany in parallel
  const [total, articles] = await withDbTiming(
    metrics,
    () =>
      Promise.all([
        hasUserScopedQuery
          ? prisma.article.count({ where })
          : cache
              .getArticleCount(cacheParams as ArticleQueryParams, async () => {
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
 * Execute personalized article query
 */
async function executePersonalizedQuery(
  params: ParsedQueryParams,
  metrics: MetricsCollector
): Promise<ArticleQueryResult | null> {
  const { pagination, display, personalization } = params;
  const { page, limit, sortBy, sortOrder } = pagination;
  const { categoryIds, periodMonths } = personalization;

  try {
    const personalizationOptions: PersonalizedFilterOptions = {
      categoryIds,
      periodMonths,
      limit,
      offset: (page - 1) * limit,
      sortBy: sortBy as PersonalizedSortBy,
      sortOrder,
    };

    const { articles: scoredArticles, meta: personalizationMeta } =
      await categoryFilterService.filterArticles(personalizationOptions);

    const personalizedIds = scoredArticles.map((article) => article.articleId);

    if (personalizedIds.length === 0) {
      return null; // Fall back to standard query
    }

    const selectFields = buildSelectFields(display);

    const personalizedArticles = await withDbTiming(
      metrics,
      () =>
        prisma.article.findMany({
          where: { id: { in: personalizedIds } },
          select: selectFields,
        }),
      'db_query'
    );

    // Preserve personalization ranking order
    const personalizedArticlesById = new Map(
      personalizedArticles.filter((article) => !!article?.id).map((article) => [article.id, article])
    );

    const orderedItems = personalizedIds
      .map((id) => personalizedArticlesById.get(id))
      .filter(
        (article): article is (typeof personalizedArticles)[number] => Boolean(article)
      );

    const totalMatched = personalizationMeta?.totalMatched ?? personalizedIds.length;

    return {
      items: orderedItems as ArticleWithRelations[],
      total: totalMatched,
      page,
      limit,
      totalPages: Math.ceil(totalMatched / limit),
    };
  } catch (error) {
    logger.error({ err: error }, 'Personalized filtering failed, falling back to standard query');
    return null;
  }
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

    // Start auth early for parallel execution
    const sessionPromise = auth();

    // Check if user session is required
    const requiresUserSession =
      filters.readFilter === 'read' ||
      filters.readFilter === 'unread' ||
      display.includeUserData;
    const session = requiresUserSession ? await sessionPromise : null;
    const userId = session?.user?.id;

    // Return 401 if readFilter is used without authentication
    if ((filters.readFilter === 'read' || filters.readFilter === 'unread') && !userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required for read filter',
        },
        { status: 401 }
      );
    }

    const hasUserScopedQuery =
      (filters.readFilter === 'read' || filters.readFilter === 'unread') && !!userId;
    const hasUserContext = (display.includeUserData && !!userId) || hasUserScopedQuery;
    // Personalization does not support readFilter - skip personalization when readFilter is active
    const shouldUsePersonalizedFilter =
      personalization.categoryIds.length > 0 && !hasUserScopedQuery;

    // Execute query
    let baseResult: ArticleQueryResult;

    if (shouldUsePersonalizedFilter) {
      // Try personalized query first
      const personalizedResult = await executePersonalizedQuery(params, metrics);
      if (personalizedResult) {
        baseResult = personalizedResult;
      } else {
        // Fall back to standard query
        baseResult = await executeStandardQuery(params, userId, hasUserScopedQuery, metrics);
      }
    } else {
      // Standard query with caching
      const cacheParams = buildCacheParams(params, userId, hasUserScopedQuery);

      if (hasUserScopedQuery) {
        // User-scoped queries bypass cache
        baseResult = await executeStandardQuery(params, userId, hasUserScopedQuery, metrics);
      } else {
        // Use cache
        const cacheResult = await withCacheTiming(
          metrics,
          () =>
            cache.getArticles(
              cacheParams as ArticleQueryParams,
              () => executeStandardQuery(params, userId, hasUserScopedQuery, metrics)
            ),
          'cache_articles'
        );
        baseResult = cacheResult ?? createEmptyResponse(page, limit);
      }
    }

    // Merge user data if needed
    let result = baseResult;

    if (display.includeUserData && userId && baseResult?.items?.length > 0) {
      const bypassFavoriteL1 = Boolean(request.cookies.get('tt_fav_bust')?.value);
      const articleIds = extractArticleIds(baseResult.items);
      const userSpecificData = await fetchUserSpecificData(userId, articleIds, metrics, {
        bypassFavoriteL1,
      });

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
    const dbError =
      error instanceof Error
        ? new DatabaseError(`Failed to fetch articles: ${error.message}`, 'select')
        : new DatabaseError('Failed to fetch articles', 'select');

    const errorResponse = formatErrorResponse(dbError);
    return NextResponse.json(errorResponse, { status: dbError.statusCode });
  }
}
