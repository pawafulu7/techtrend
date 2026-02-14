import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { PaginatedResponse, ApiResponse } from '@/lib/types/api';
import { DatabaseError, formatErrorResponse } from '@/lib/errors';
import { RedisCache } from '@/lib/cache';
import type { Prisma, ArticleCategory } from '@prisma/client';
import logger from '@/lib/logger';
import { auth } from '@/lib/auth/auth';
import { createLoaders } from '@/lib/dataloader';
import { normalizeArticleCategory } from '@/lib/utils/article-category-normalizer';
import { getCursorManager } from '@/lib/pagination/cursor-manager';
import {
  getDateRangeFilter,
  parseDateFromTo,
  getDateFieldForSort,
} from '@/app/lib/date-utils';

type ArticleWhereInput = Prisma.ArticleWhereInput;

// Lightweight article type with minimal source relation included for UI rendering
interface LightweightArticle {
  id: string;
  title: string;
  translatedTitle: string | null;
  url: string;
  summary: string | null;
  thumbnail: string | null;
  publishedAt: Date | string;
  sourceId: string;
  source: {
    id: string;
    name: string;
    type: string;
    url: string;
  };
  category: ArticleCategory | null;
  qualityScore: number;
  bookmarks: number;
  userVotes: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  // Content length for reading time calculation (content itself excluded for performance)
  contentLength?: number | null;
  // User-specific data (when includeUserData=true)
  isFavorited?: boolean;
  isRead?: boolean;
  // Company name for hatena_blog_dev articles
  companyName?: string;
}

// Initialize Redis cache with 30 minutes TTL for lightweight articles
const cache = new RedisCache({
  ttl: 1800, // 30 minutes (increased from 5 minutes)
  namespace: '@techtrend/cache:api:lightweight',
});

// 総件数専用のキャッシュ（5分TTL）
const countCache = new RedisCache({
  ttl: 300, // 5分
  namespace: '@techtrend/cache:api:count',
});

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
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('limit') || '20'))
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
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as
      | 'asc'
      | 'desc';

    // Determine pagination mode
    const useCursor = !!(cursor || after || before);
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
    // Low quality article filter - default false (new articles have qualityScore=0)
    const excludeLowQualityParam = searchParams.get('excludeLowQuality');
    const excludeLowQuality = excludeLowQualityParam === 'true'; // Default false
    // Exclude specific sources (e.g., arXiv papers from home page)
    const excludeSources = searchParams.get('excludeSources');

    // Generate cache key
    const normalizedSearch = search
      ? search
          .trim()
          .split(/[\s　]+/)
          .filter((k) => k.length > 0)
          .sort()
          .join(',')
      : 'none';

    const normalizedSources = (() => {
      if (sources) {
        const trimmedLower = sources.trim().toLowerCase();
        // Normalize special values for consistent cache keys
        if (trimmedLower === 'all' || trimmedLower === 'none') {
          return trimmedLower;
        }
        return sources
          .split(',')
          .filter((id) => id.trim())
          .sort()
          .join(',');
      }
      return sourceId || 'all';
    })();

    // needsAuth: session retrieval required (includeUserData or readFilter)
    const needsAuth =
      readFilter === 'read' || readFilter === 'unread' || includeUserData;
    // needsUserInCacheKey: only when readFilter changes the WHERE clause
    // includeUserData does not affect WHERE - it triggers DataLoader merge after cache fetch
    const needsUserInCacheKey =
      readFilter === 'read' || readFilter === 'unread';
    const session = needsAuth ? await auth() : null;
    const userId = session?.user?.id;

    // Include userId in cache key only when readFilter modifies query results
    const userCtxForKey = needsUserInCacheKey ? (userId ?? 'anonymous') : 'n/a';

    // Include cursor in cache key if using cursor pagination
    // Normalize excludeSources for cache key
    const normalizedExcludeSources = excludeSources
      ? excludeSources
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .sort()
          .join(',')
      : 'none';

    const cacheKey = cache.generateCacheKey('articles:lightweight', {
      params: {
        cursor: effectiveCursor || 'none',
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
        const articleIds = result.items.map((a) => a.id);
        const loaders = createLoaders(
          { userId },
          { favorite: { bypassL1: bypassFavoriteL1 } }
        );

        if (loaders.favorite && loaders.view) {
          const [favoriteStatuses, viewStatuses] = await Promise.all([
            loaders.favorite.loadMany(articleIds),
            loaders.view.loadMany(articleIds),
          ]);

          const favoritesMap = new Map<string, boolean>();
          const readStatusMap = new Map<string, boolean>();

          favoriteStatuses.forEach((status) => {
            if (
              status &&
              typeof status === 'object' &&
              'isFavorited' in status
            ) {
              favoritesMap.set(status.articleId, status.isFavorited);
            }
          });

          viewStatuses.forEach((status) => {
            if (status && typeof status === 'object' && 'isRead' in status) {
              readStatusMap.set(status.articleId, status.isRead);
            }
          });

          // Create new items array with user data
          result = {
            ...result,
            items: result.items.map((article) => ({
              ...article,
              isFavorited: favoritesMap.get(article.id) || false,
              isRead: readStatusMap.get(article.id) || false,
            })),
          };
        }
      }
    } else {
      cacheStatus = cachedResult ? 'STALE' : 'MISS';

      // Build where clause
      const where: ArticleWhereInput = {};

      // Exclude articles without processed summaries
      if (excludeUnprocessed) {
        where.summaryComputedAt = { not: null };
      }

      // Exclude low quality articles (default behavior)
      // Filters out articles with:
      // - skipReason IN ('THIN_CONTENT', 'QUALITY_FAILED')
      // - qualityScore < 30 (scale is 0-100), null values are included
      // TODO: Refactor to use shared ArticleWhereClauseBuilder from query-builder.ts
      if (excludeLowQuality) {
        // Build AND conditions for low quality filter
        const lowQualityFilters: ArticleWhereInput[] = [
          // Exclude THIN_CONTENT and QUALITY_FAILED skip reasons
          // PDF and SLIDE are valid content types, so they are NOT excluded
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
          // Exclude low quality score (< 30)
          // Note: qualityScore is Float @default(0), so null is not possible
          { qualityScore: { gte: 30 } },
        ];

        // Merge with existing AND conditions
        if (!where.AND) {
          where.AND = [];
        } else if (!Array.isArray(where.AND)) {
          where.AND = [where.AND];
        }
        where.AND = [...where.AND, ...lowQualityFilters];
      }

      // Apply cursor-based pagination if cursor provided
      let hasPreviousPage = false;
      let cursorPayload: ReturnType<typeof cursorManager.decodeCursor> | null =
        null;
      let isBackwardCursor = false;
      let cursorFilter: ArticleWhereInput | null = null;
      if (useCursor && effectiveCursor) {
        cursorPayload = cursorManager.decodeCursor(effectiveCursor);
        if (cursorPayload) {
          // Validate sort conditions match
          if (
            cursorManager.validateSortCondition(
              cursorPayload,
              finalSortBy,
              sortOrder
            )
          ) {
            // Build WHERE clause for cursor pagination (分離保持)
            const direction = before ? 'backward' : 'forward';
            const cursorWhere = cursorManager.buildWhereClause(
              cursorPayload,
              direction
            );
            cursorFilter =
              Object.keys(cursorWhere).length > 0 ? cursorWhere : null;

            // For backward pagination, we need to check if there are previous items
            isBackwardCursor = Boolean(before);
          } else {
            // Sort conditions have changed, ignore cursor
            logger.warn(
              'cursor-pagination.sort-mismatch: Cursor invalidated due to sort change'
            );
          }
        } else {
          // Invalid or expired cursor, proceed with offset pagination
          logger.warn(
            'cursor-pagination.invalid-cursor: Falling back to offset'
          );
        }
      }

      // Apply read filter if user is authenticated
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

      // Apply source filter
      if (sources || sourceId) {
        // Handle special values (case-insensitive)
        const normalizedSourcesValue = sources?.trim().toLowerCase();

        if (normalizedSourcesValue === 'none') {
          // No sources selected - return empty result
          where.sourceId = { in: [] };
        } else if (normalizedSourcesValue !== 'all') {
          // Specific sources or sourceId - apply filter
          const sourceIds = sources
            ? sources.split(',').filter((id) => id.trim())
            : [sourceId!];

          if (sourceIds.length > 0) {
            where.sourceId = {
              in: sourceIds,
            };
          }
        }
        // 'all' case: Don't set sourceId filter (include all sources)
      }

      // Always filter to enabled sources only
      where.source = { enabled: true };

      // Apply exclude sources filter (e.g., exclude arXiv papers from home page)
      if (excludeSources) {
        const excludeIds = excludeSources
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

        if (excludeIds.length > 0) {
          // Merge with existing sourceId filter
          const currentSourceId = where.sourceId;
          if (currentSourceId && typeof currentSourceId === 'object') {
            // Already has filter (e.g., { in: [...] })
            // Merge with existing notIn array if present
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
            // Single source ID - check if it's in exclude list
            if (excludeIds.includes(currentSourceId)) {
              // The only allowed source is excluded, return empty
              where.sourceId = { in: [] };
            }
            // Otherwise, keep the single source ID (it's not excluded)
          } else {
            // No existing filter, just add notIn
            where.sourceId = { notIn: excludeIds };
          }
        }
      }

      // Apply category filter with normalization
      if (category && category !== 'all') {
        // Handle 'uncategorized' as null
        if (category === 'uncategorized') {
          where.category = null;
        } else {
          // Normalize category name (e.g., 'TECH' -> 'frontend')
          const normalizedCategory = normalizeArticleCategory(category);
          if (normalizedCategory) {
            where.category = normalizedCategory;
          }
          // If normalization returns null, skip the filter
        }
      }

      // Apply tag filter with direct name matching (case-insensitive)
      // This approach matches query-builder.ts and handles duplicate tags correctly
      // (e.g., "ChatGPT" and "Chatgpt" both match when searching for "chatgpt")
      if (tag || tags) {
        const tagList = tags
          ? tags
              .split(',')
              .map((t) => t.trim())
              .filter((t) => t.length > 0)
          : tag
            ? [tag]
            : [];

        if (tagList.length > 0) {
          if (tagMode === 'AND') {
            // AND mode: Articles must have ALL specified tags (case-insensitive)
            const tagConditions: ArticleWhereInput[] = tagList.map(
              (tagName) => ({
                tags: {
                  some: {
                    name: { equals: tagName, mode: 'insensitive' as const },
                  },
                },
              })
            );
            if (!where.AND) {
              where.AND = [];
            } else if (!Array.isArray(where.AND)) {
              where.AND = [where.AND];
            }
            where.AND = [...where.AND, ...tagConditions];
          } else {
            // OR mode: Articles must have at least one of the specified tags (case-insensitive)
            // Note: Prisma's `in` doesn't support mode, so we use OR conditions
            where.tags = {
              some: {
                OR: tagList.map((tagName) => ({
                  name: { equals: tagName, mode: 'insensitive' as const },
                })),
              },
            };
          }
        }
      }

      // Apply search filter
      if (search) {
        const keywords = search
          .trim()
          .split(/[\s　]+/)
          .filter((k) => k.length > 0);

        if (keywords.length === 1) {
          // Single keyword - OR search
          where.OR = [
            { title: { contains: keywords[0], mode: 'insensitive' } },
            { summary: { contains: keywords[0], mode: 'insensitive' } },
          ];
        } else if (keywords.length > 1) {
          // Multiple keywords - AND search
          // 既存のAND条件とマージ
          const keywordConditions: ArticleWhereInput[] = keywords.map(
            (keyword) => ({
              OR: [
                { title: { contains: keyword, mode: 'insensitive' } },
                { summary: { contains: keyword, mode: 'insensitive' } },
              ],
            })
          );
          if (!where.AND) {
            where.AND = [];
          } else if (!Array.isArray(where.AND)) {
            where.AND = [where.AND];
          }
          where.AND = [...where.AND, ...keywordConditions];
        }
      }

      // Apply date range filter (sortBy-linked)
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

      // 総件数用のキャッシュキーを生成（where条件に基づく）
      const isUserScopedCount =
        readFilter === 'read' || readFilter === 'unread';
      const countCacheKey = countCache.generateCacheKey('articles:count', {
        params: {
          sources: normalizedSources,
          excludeSources: normalizedExcludeSources,
          tag: tag || 'all',
          tags: tags || 'none',
          tagMode: tagMode,
          search: normalizedSearch,
          dateRange: dateRange || 'all',
          dateFrom: dateFrom || '',
          dateTo: dateTo || '',
          sortBy: finalSortBy,
          readFilter: readFilter || 'all',
          category: category || 'all',
          // read/unread時はユーザー固有の総件数
          userId: isUserScopedCount ? (userId ?? 'anonymous') : 'n/a',
        },
      });

      // Get count and articles in parallel (Quick Win 2+3: 50-100ms improvement)
      const countPromise = (async () => {
        // Quick Win 2: Use client-provided total only for offset pagination page >1
        // Prevents total manipulation on initial load or cursor pagination
        if (!useCursor && page > 1 && totalParam) {
          const parsedTotal = Number.parseInt(totalParam, 10);
          if (!Number.isNaN(parsedTotal) && parsedTotal >= (page - 1) * limit) {
            return parsedTotal;
          }
        }

        const cachedCount = await countCache.get<number>(countCacheKey);
        if (cachedCount !== null && cachedCount !== undefined) {
          return cachedCount;
        }

        const countWhere = { ...where };
        const computedTotal = await prisma.article.count({ where: countWhere });
        await countCache.set(countCacheKey, computedTotal);
        return computedTotal;
      })();

      // Get articles - Optimized query with minimal source relation
      // For cursor pagination, fetch limit+1 to determine hasNextPage
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
          content: true, // For contentLength calculation, stripped before response
          // No tags relation selected (performance optimization)
          // No detailedSummary field selected (reduces data transfer)
        },
        orderBy: [
          { [finalSortBy]: sortOrder },
          { id: sortOrder }, // Secondary sort by id for stable cursor pagination
        ],
        skip: useCursor ? 0 : (page - 1) * limit, // No skip for cursor pagination
        take: fetchLimit,
      });

      // Execute count and articles in parallel
      const [total, articles] = await Promise.all([
        countPromise,
        articlesPromise,
      ]);

      // Fetch company names for hatena_blog_dev articles (batch query)
      // Note: This requires a separate query to load tags for company name extraction.
      // Only hatena_blog_dev articles need this, and we limit to the page size to avoid
      // fetching tags for the extra cursor record.
      const companyNameMap: Map<string, string> = new Map();
      const hatenaArticleIds = articles
        .slice(0, limit) // Only process articles within the page limit
        .filter((a) => a.sourceId === 'hatena_blog_dev')
        .map((a) => a.id);

      if (hatenaArticleIds.length > 0) {
        const hatenaArticlesWithTags = await prisma.article.findMany({
          where: { id: { in: hatenaArticleIds } },
          select: {
            id: true,
            tags: { select: { name: true } },
          },
        });

        // Extract company name from tags (pattern: 株式会社/合同会社/有限会社)
        const companyPattern = /株式会社|合同会社|有限会社/;
        for (const article of hatenaArticlesWithTags) {
          const companyTag = article.tags.find((t) =>
            companyPattern.test(t.name)
          );
          if (companyTag) {
            companyNameMap.set(article.id, companyTag.name);
          }
        }
      }

      if (useCursor && cursorPayload) {
        if (isBackwardCursor) {
          // Backward navigation reaches the beginning when we no longer fetch an extra record
          hasPreviousPage = articles.length > limit;
        } else {
          // Any forward cursor request implies earlier items are available
          hasPreviousPage = true;
        }
      }

      // Fetch user-specific data if requested
      const favoritesMap: Map<string, boolean> = new Map();
      const readStatusMap: Map<string, boolean> = new Map();

      if (includeUserData && userId) {
        const articleIds = articles.slice(0, limit).map((a) => a.id); // Use only the requested limit

        logger.info(
          `DataLoader integration: userId=${userId}, articles=${articleIds.length}`
        );

        // Create DataLoader instances for this request
        const loaders = createLoaders(
          { userId },
          { favorite: { bypassL1: bypassFavoriteL1 } }
        );

        if (loaders.favorite && loaders.view) {
          // Fetch favorites and read status using DataLoader (batched)
          const [favoriteStatuses, viewStatuses] = await Promise.all([
            loaders.favorite.loadMany(articleIds),
            loaders.view.loadMany(articleIds),
          ]);

          logger.info(
            `DataLoader results: favorites=${favoriteStatuses.length}, views=${viewStatuses.length}`
          );

          // Create maps for O(1) lookup
          favoriteStatuses.forEach((status) => {
            if (
              status &&
              typeof status === 'object' &&
              'isFavorited' in status
            ) {
              favoritesMap.set(status.articleId, status.isFavorited);
            }
          });

          viewStatuses.forEach((status) => {
            if (status && typeof status === 'object' && 'isRead' in status) {
              readStatusMap.set(status.articleId, status.isRead);
            }
          });

          logger.info(
            `DataLoader maps: favorites=${favoritesMap.size}, reads=${readStatusMap.size}`
          );
        }
      } else {
        logger.info(
          `DataLoader skipped: includeUserData=${includeUserData}, userId=${userId}`
        );
      }

      // Process results for cursor pagination
      let pageInfo;
      let normalizedArticles;

      if (useCursor) {
        // Generate page info for cursor pagination
        const pageData = cursorManager.generatePageInfo(
          articles,
          limit,
          finalSortBy,
          sortOrder,
          {
            sources: normalizedSources,
            tags: tags || tag,
            search,
            dateRange,
            dateFrom,
            dateTo,
            readFilter,
            category,
          },
          hasPreviousPage
        );

        pageInfo = {
          hasNextPage: pageData.hasNextPage,
          hasPreviousPage: pageData.hasPreviousPage,
          startCursor: pageData.startCursor,
          endCursor: pageData.endCursor,
        };

        // Normalize dates and add user data for actual page items
        normalizedArticles = pageData.items.map((article) => {
          // Extract content for length calculation, then exclude from response
          const { content, ...articleWithoutContent } =
            article as typeof article & { content?: string | null };
          const normalized: LightweightArticle = {
            ...articleWithoutContent,
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
            contentLength: typeof content === 'string' ? content.length : null,
          };

          // Add user-specific data if requested
          if (includeUserData && userId) {
            normalized.isFavorited = favoritesMap.get(article.id) || false;
            normalized.isRead = readStatusMap.get(article.id) || false;
          }

          // Add company name for hatena_blog_dev articles
          const companyName = companyNameMap.get(article.id);
          if (companyName) {
            normalized.companyName = companyName;
          }

          return normalized;
        });

        // Build cursor-based response
        result = {
          items: normalizedArticles as LightweightArticle[],
          total,
          pageInfo,
          // Include legacy pagination fields for backward compatibility
          page: 1, // Cursor pagination doesn't have traditional page numbers
          limit,
          totalPages: Math.ceil(total / limit),
        };
      } else {
        // Traditional offset pagination - but generate cursor info for transition
        normalizedArticles = articles.map((article) => {
          // Extract content for length calculation, then exclude from response
          const { content, ...articleWithoutContent } =
            article as typeof article & { content?: string | null };
          const normalized: LightweightArticle = {
            ...articleWithoutContent,
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
            contentLength: typeof content === 'string' ? content.length : null,
          };

          // Add user-specific data if requested
          if (includeUserData && userId) {
            normalized.isFavorited = favoritesMap.get(article.id) || false;
            normalized.isRead = readStatusMap.get(article.id) || false;
          }

          // Add company name for hatena_blog_dev articles
          const companyName = companyNameMap.get(article.id);
          if (companyName) {
            normalized.companyName = companyName;
          }

          return normalized;
        });

        // Generate cursor info for offset pagination too (for easy transition)
        let pageInfo: PaginatedResponse<LightweightArticle>['pageInfo'] =
          undefined;
        if (articles.length > 0) {
          const hasNextPage = page < Math.ceil(total / limit);
          const hasPreviousPage = page > 1;

          const firstItem = articles[0];
          const lastItem = articles[articles.length - 1];

          const startCursor = cursorManager.encodeCursor({
            sortBy: finalSortBy,
            sortOrder,
            values: {
              [finalSortBy]: firstItem[finalSortBy],
              id: firstItem.id,
            },
            limit,
            filters: {
              sources: normalizedSources,
              tags: tags || tag,
              search,
              dateRange,
              dateFrom,
              dateTo,
              readFilter,
              category,
            },
          });

          const endCursor = cursorManager.encodeCursor({
            sortBy: finalSortBy,
            sortOrder,
            values: {
              [finalSortBy]: lastItem[finalSortBy],
              id: lastItem.id,
            },
            limit,
            filters: {
              sources: normalizedSources,
              tags: tags || tag,
              search,
              dateRange,
              dateFrom,
              dateTo,
              readFilter,
              category,
            },
          });

          pageInfo = {
            hasNextPage,
            hasPreviousPage,
            startCursor,
            endCursor,
          };
        }

        // Return the data to be cached
        result = {
          items: normalizedArticles as LightweightArticle[],
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          pageInfo, // Include cursor info for offset pagination too
        };
      }

      // Save to cache
      // Note: Cache is always saved regardless of includeUserData
      // User data will be merged after cache fetch
      await cache.set(cacheKey, result);
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
        userDataIncluded: includeUserData && userId ? true : false,
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
