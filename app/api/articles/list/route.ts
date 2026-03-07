import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { PaginatedResponse, ApiResponse } from '@/lib/types/api';
import { DatabaseError, formatErrorResponse } from '@/lib/errors';
import type { Prisma } from '@prisma/client';
import logger from '@/lib/logger';
import { auth } from '@/lib/auth/auth';
import { getCursorManager } from '@/lib/pagination/cursor-manager';

import type { LightweightArticle } from './types';
import { cache } from './cache-config';
import {
  buildWhereClause,
  normalizeSearchForCacheKey,
  normalizeSourcesForCacheKey,
  normalizeExcludeSourcesForCacheKey,
  fetchTotalCount,
} from './query-helpers';
import {
  fetchCompanyNames,
  buildCursorResult,
  buildOffsetResult,
  fetchAndMergeUserData,
  mergeUserDataIntoCachedResult,
} from './response-builder';

/**
 * Lightweight articles API endpoint
 * Optimized for performance by excluding heavy fields (tags, content, detailedSummary)
 * while including minimal source relation for UI display requirements
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  let cacheStatus = 'MISS';

  try {
    const { searchParams } = new URL(request.url);

    // Use CursorManager (static import)
    const cursorManager = getCursorManager();

    // Parse pagination params - Support both cursor and offset
    const cursor = searchParams.get('cursor');
    const after = searchParams.get('after'); // Alternative cursor parameter
    const before = searchParams.get('before'); // For backward pagination
    const rawPage = parseInt(searchParams.get('page') || '1', 10);
    const page = Math.max(1, Number.isNaN(rawPage) ? 1 : rawPage);
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const limit = Math.min(
      100,
      Math.max(1, Number.isNaN(rawLimit) ? 20 : rawLimit)
    );
    const sortBy = searchParams.get('sortBy') || 'publishedAt';
    const validSortFields = [
      'publishedAt',
      'createdAt',
      'qualityScore',
      'bookmarks',
      'userVotes',
    ];
    const finalSortBy = validSortFields.includes(sortBy)
      ? sortBy
      : 'publishedAt';
    const rawSortOrder = searchParams.get('sortOrder') || 'desc';
    const sortOrder: 'asc' | 'desc' = ['asc', 'desc'].includes(rawSortOrder)
      ? (rawSortOrder as 'asc' | 'desc')
      : 'desc';

    // Determine pagination mode
    let useCursor = !!(cursor || after || before);
    const effectiveCursor = cursor || after || before;

    // Parse filters
    const sources = searchParams.get('sources');
    const sourceId = searchParams.get('sourceId');
    const tag = searchParams.get('tag');
    const tags = searchParams.get('tags');
    const tagMode = searchParams.get('tagMode') || 'OR';
    const search = searchParams.get('search');
    const dateRange = searchParams.get('dateRange');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const readFilter = searchParams.get('readFilter');
    const category = searchParams.get('category');
    const excludeUnprocessed =
      searchParams.get('excludeUnprocessed') === 'true';
    const includeUserData = searchParams.get('includeUserData') === 'true';
    const totalParam = searchParams.get('total'); // Quick Win 2: Skip COUNT on page >1
    const bypassFavoriteL1 = Boolean(request.cookies.get('tt_fav_bust')?.value);
    const excludeLowQuality = searchParams.get('excludeLowQuality') === 'true';
    const excludeSources = searchParams.get('excludeSources');

    // Generate cache key
    const normalizedSearch = normalizeSearchForCacheKey(search);
    const normalizedSources = normalizeSourcesForCacheKey(sources, sourceId);

    const needsAuth =
      readFilter === 'read' || readFilter === 'unread' || includeUserData;
    const needsUserInCacheKey =
      readFilter === 'read' || readFilter === 'unread';
    const session = needsAuth ? await auth() : null;
    const userId = session?.user?.id;

    // readFilter=read/unread requires authentication
    if (needsUserInCacheKey && !userId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required for read/unread filter',
          },
        },
        { status: 401 }
      );
    }

    // Include userId in cache key only when readFilter modifies query results
    const userCtxForKey = needsUserInCacheKey ? (userId ?? 'anonymous') : 'n/a';

    // Include cursor in cache key if using cursor pagination
    const normalizedExcludeSources =
      normalizeExcludeSourcesForCacheKey(excludeSources);

    // Validate cursor BEFORE generating cache key so useCursor reflects validated state
    let cursorPayload: ReturnType<typeof cursorManager.decodeCursor> | null =
      null;
    let isBackwardCursor = false;
    let cursorFilter: Prisma.ArticleWhereInput | null = null;
    if (useCursor && effectiveCursor) {
      cursorPayload = cursorManager.decodeCursor(effectiveCursor);
      if (cursorPayload) {
        if (
          cursorManager.validateSortCondition(
            cursorPayload,
            finalSortBy,
            sortOrder
          )
        ) {
          const direction = before ? 'backward' : 'forward';
          const cursorWhere = cursorManager.buildWhereClause(
            cursorPayload,
            direction
          );
          cursorFilter =
            Object.keys(cursorWhere).length > 0 ? cursorWhere : null;
          isBackwardCursor = Boolean(before);
        } else {
          logger.warn(
            'cursor-pagination.sort-mismatch: Cursor invalidated due to sort change'
          );
          useCursor = false;
        }
        if (
          cursorFilter !== null &&
          !cursorManager.validateFilters(cursorPayload, {
            sources: normalizedSources,
            tags: tags || tag,
            tagMode,
            search,
            dateRange,
            dateFrom,
            dateTo,
            readFilter,
            category,
            excludeSources: normalizedExcludeSources,
            excludeUnprocessed: excludeUnprocessed ? 'true' : 'false',
            excludeLowQuality: excludeLowQuality ? 'true' : 'false',
          })
        ) {
          logger.warn(
            'cursor-pagination.filter-mismatch: Cursor invalidated due to filter change'
          );
          useCursor = false;
          cursorPayload = null;
          cursorFilter = null;
        }
      } else {
        logger.warn('cursor-pagination.invalid-cursor: Falling back to offset');
        useCursor = false;
      }
    }

    const cacheKey = cache.generateCacheKey('articles:lightweight', {
      params: {
        cursor: useCursor ? effectiveCursor || 'none' : 'none',
        page: useCursor ? 'cursor' : page.toString(),
        limit: limit.toString(),
        sortBy: finalSortBy,
        sortOrder,
        sources: normalizedSources,
        excludeSources: normalizedExcludeSources,
        tag: tag || 'all',
        tags: tags || 'none',
        tagMode: tagMode,
        search: normalizedSearch,
        dateRange: dateRange || 'all',
        dateFrom: dateFrom || '',
        dateTo: dateTo || '',
        readFilter: readFilter || 'all',
        userId: userCtxForKey,
        category: category || 'all',
        excludeUnprocessed: excludeUnprocessed ? 'true' : 'false',
        excludeLowQuality: excludeLowQuality ? 'true' : 'false',
        // Note: includeUserData removed from cache key - user data is merged after cache fetch
      },
    });

    // Check cache first
    // readFilter requires user-specific queries so we skip cache in that case
    // includeUserData no longer skips cache - user data is merged after cache fetch
    const shouldSkipCache =
      (readFilter === 'read' || readFilter === 'unread') && userId;
    const cachedResult = shouldSkipCache
      ? null
      : await cache.get<PaginatedResponse<LightweightArticle>>(cacheKey);
    // Legacy cache entries may lack cursor metadata; treat them as stale so pageInfo is rebuilt
    const needsPageInfoHydration = Boolean(
      cachedResult &&
      useCursor &&
      (!cachedResult.pageInfo ||
        typeof cachedResult.pageInfo.hasNextPage === 'undefined' ||
        typeof cachedResult.pageInfo.hasPreviousPage === 'undefined')
    );

    let result;
    if (cachedResult && !needsPageInfoHydration) {
      cacheStatus = 'HIT';
      result = cachedResult;

      // Merge user data into cached result if requested
      if (
        includeUserData &&
        userId &&
        result.items &&
        result.items.length > 0
      ) {
        result = await mergeUserDataIntoCachedResult(
          result,
          userId,
          bypassFavoriteL1
        );
      }
    } else {
      cacheStatus = cachedResult ? 'STALE' : 'MISS';

      // Build where clause
      const where = buildWhereClause({
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
        userId,
        category,
        excludeUnprocessed,
        excludeLowQuality,
        finalSortBy,
      });

      // Apply cursor-based pagination if cursor provided
      let hasPreviousPage = false;

      // Get count and articles in parallel (Quick Win 2+3: 50-100ms improvement)
      const countPromise = fetchTotalCount({
        where,
        normalizedSources,
        normalizedExcludeSources,
        tag,
        tags,
        tagMode,
        normalizedSearch,
        dateRange,
        dateFrom,
        dateTo,
        finalSortBy,
        readFilter,
        category,
        userId,
        useCursor,
        page,
        limit,
        totalParam,
        excludeUnprocessed,
        excludeLowQuality,
      });

      // Get articles - Optimized query with minimal source relation
      const fetchLimit = useCursor ? limit + 1 : limit;

      const articlesPromise = prisma.article.findMany({
        where: cursorFilter ? { AND: [where, cursorFilter] } : where,
        select: {
          id: true,
          title: true,
          translatedTitle: true,
          url: true,
          summary: true,
          thumbnail: true,
          publishedAt: true,
          sourceId: true,
          source: {
            select: {
              id: true,
              name: true,
              type: true,
              url: true,
            },
          },
          category: true,
          qualityScore: true,
          bookmarks: true,
          userVotes: true,
          createdAt: true,
          updatedAt: true,
          contentLength: true, // Pre-calculated by DB trigger
        },
        orderBy: [
          { [finalSortBy]: sortOrder },
          { id: sortOrder }, // Secondary sort by id for stable cursor pagination
        ],
        skip: useCursor ? 0 : (page - 1) * limit,
        take: fetchLimit,
      });

      // Execute count and articles in parallel
      const [total, articles] = await Promise.all([
        countPromise,
        articlesPromise,
      ]);

      // Fetch company names for hatena_blog_dev articles
      const companyNameMap = await fetchCompanyNames(articles as any, limit);

      if (useCursor && cursorPayload) {
        if (isBackwardCursor) {
          hasPreviousPage = articles.length > limit;
        } else {
          hasPreviousPage = true;
        }
      }

      // Build pagination result
      const commonFilterParams = {
        normalizedSources,
        tags,
        tag,
        tagMode,
        search,
        dateRange,
        dateFrom,
        dateTo,
        readFilter,
        category,
        companyNameMap,
        excludeSources: normalizedExcludeSources,
        excludeUnprocessed,
        excludeLowQuality,
      };

      if (useCursor && cursorPayload) {
        result = buildCursorResult({
          articles: articles as any,
          total,
          limit,
          finalSortBy,
          sortOrder,
          hasPreviousPage,
          ...commonFilterParams,
        });
      } else {
        result = buildOffsetResult({
          articles: articles as any,
          total,
          page,
          limit,
          finalSortBy,
          sortOrder,
          ...commonFilterParams,
        });
      }

      // Save to cache (without user-specific data to prevent cross-user leakage)
      await cache.set(cacheKey, result);

      // Merge user-specific data AFTER cache save
      if (
        includeUserData &&
        userId &&
        result.items &&
        result.items.length > 0
      ) {
        const mergedItems = await fetchAndMergeUserData(
          result.items,
          userId,
          bypassFavoriteL1
        );
        result = { ...result, items: mergedItems };
      } else {
        logger.debug(
          `DataLoader skipped: includeUserData=${includeUserData}, userId=${userId}`
        );
      }
    }

    // Calculate response time
    const responseTime = Date.now() - startTime;

    // Create response with performance headers
    const response = NextResponse.json({
      success: true,
      data: result,
      meta: {
        lightweight: true,
        info: 'This endpoint returns lightweight article data without relations for better performance',
        userDataIncluded: Boolean(includeUserData && userId),
        paginationMode: useCursor ? 'cursor' : 'offset',
      },
    } as ApiResponse<PaginatedResponse<LightweightArticle>>);

    response.headers.set('X-Cache-Status', cacheStatus);
    response.headers.set('X-Response-Time', `${responseTime}ms`);
    response.headers.set('X-API-Version', 'lightweight-v2');
    response.headers.set('X-Pagination-Mode', useCursor ? 'cursor' : 'offset');

    return response;
  } catch (error) {
    logger.error({ error }, 'Error fetching lightweight articles');

    const dbError =
      error instanceof Error
        ? new DatabaseError(
            `Failed to fetch lightweight articles: ${error.message}`,
            'select'
          )
        : new DatabaseError('Failed to fetch lightweight articles', 'select');

    const errorResponse = formatErrorResponse(dbError);
    return NextResponse.json(errorResponse, { status: dbError.statusCode });
  }
}
