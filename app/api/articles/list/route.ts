import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { PaginatedResponse, ApiResponse } from '@/lib/types/api';
import { DatabaseError, formatErrorResponse } from '@/lib/errors';
import { RedisCache } from '@/lib/cache';
import type { Prisma, ArticleCategory } from '@prisma/client';
import logger from '@/lib/logger';
import { auth } from '@/lib/auth/auth';
import { createLoaders } from '@/lib/dataloader';
import { TagCache } from '@/lib/cache/tag-mapping-cache';
import { FilterCache } from '@/lib/cache/filter-cache';
import { normalizeArticleCategory } from '@/lib/utils/article-category-normalizer';
import { getCursorManager } from '@/lib/pagination/cursor-manager';

type ArticleWhereInput = Prisma.ArticleWhereInput;

// Lightweight article type with minimal source relation included for UI rendering
interface LightweightArticle {
  id: string;
  title: string;
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
  // User-specific data (when includeUserData=true)
  isFavorited?: boolean;
  isRead?: boolean;
}

// Initialize Redis cache with 30 minutes TTL for lightweight articles
const cache = new RedisCache({
  ttl: 1800, // 30 minutes (increased from 5 minutes)
  namespace: '@techtrend/cache:api:lightweight'
});

// 総件数専用のキャッシュ（5分TTL）
const countCache = new RedisCache({
  ttl: 300, // 5分
  namespace: '@techtrend/cache:api:count'
});

// タグキャッシュ（15分TTL）
const tagCache = new TagCache({
  ttl: 900,
  namespace: '@techtrend/cache:tags'
});

// フィルタキャッシュ（30分TTL）
const filterCache = new FilterCache({
  ttl: 1800,
  namespace: '@techtrend/cache:filters'
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
    
    // Import CursorManager
    const { getCursorManager } = await import('@/lib/pagination/cursor-manager');
    const cursorManager = getCursorManager();
    
    // Parse pagination params - Support both cursor and offset
    const cursor = searchParams.get('cursor');
    const after = searchParams.get('after');  // Alternative cursor parameter
    const before = searchParams.get('before'); // For backward pagination
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const sortBy = searchParams.get('sortBy') || 'publishedAt';
    const validSortFields = ['publishedAt', 'createdAt', 'qualityScore', 'bookmarks', 'userVotes'];
    const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'publishedAt';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';
    
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
    const readFilter = searchParams.get('readFilter');
    const category = searchParams.get('category');
    const includeUserData = searchParams.get('includeUserData') === 'true';

    // Generate cache key
    const normalizedSearch = search ? 
      search.trim().split(/[\s　]+/)
        .filter(k => k.length > 0)
        .sort()
        .join(',') : 'none';
    
    const normalizedSources = sources ? 
      sources.split(',').filter(id => id.trim()).sort().join(',') : 
      sourceId || 'all';
    
    // Get session when readFilter requires user context or includeUserData is true
    const shouldUseUserContext = readFilter === 'read' || readFilter === 'unread' || includeUserData;
    const session = shouldUseUserContext ? await auth() : null;
    const userId = session?.user?.id;

    // Include userId in cache key only when user context is needed
    const userCtxForKey = shouldUseUserContext ? (userId ?? 'anonymous') : 'n/a';

    // Include cursor in cache key if using cursor pagination
    const cacheKey = cache.generateCacheKey('articles:lightweight', {
      params: {
        cursor: effectiveCursor || 'none',
        page: useCursor ? 'cursor' : page.toString(),
        limit: limit.toString(),
        sortBy: finalSortBy,
        sortOrder,
        sources: normalizedSources,
        tag: tag || 'all',
        tags: tags || 'none',
        tagMode: tagMode,
        search: normalizedSearch,
        dateRange: dateRange || 'all',
        readFilter: readFilter || 'all',
        userId: userCtxForKey,
        category: category || 'all',
        includeUserData: includeUserData ? 'true' : 'false'
      }
    });

    // Check cache first - SKIP CACHE when includeUserData is true to always get fresh data
    const cachedResult = includeUserData ? null : await cache.get<PaginatedResponse<LightweightArticle>>(cacheKey);
    // Legacy cache entries may lack cursor metadata; treat them as stale so pageInfo is rebuilt
    const needsPageInfoHydration = Boolean(
      cachedResult && useCursor && (
        !cachedResult.pageInfo ||
        typeof cachedResult.pageInfo.hasNextPage === 'undefined' ||
        typeof cachedResult.pageInfo.hasPreviousPage === 'undefined'
      )
    );

    let result;
    if (cachedResult && !needsPageInfoHydration) {
      cacheStatus = 'HIT';
      result = cachedResult;
    } else {
      cacheStatus = cachedResult ? 'STALE' : 'MISS';
      
      // Build where clause
      const where: ArticleWhereInput = {};
      
      // Apply cursor-based pagination if cursor provided
      let hasPreviousPage = false;
      let cursorPayload: ReturnType<typeof cursorManager.decodeCursor> | null = null;
      let isBackwardCursor = false;
      if (useCursor && effectiveCursor) {
        cursorPayload = cursorManager.decodeCursor(effectiveCursor);
        if (cursorPayload) {
          // Validate sort conditions match
          if (cursorManager.validateSortCondition(cursorPayload, finalSortBy, sortOrder)) {
            // Build WHERE clause for cursor pagination
            const direction = before ? 'backward' : 'forward';
            const cursorWhere = cursorManager.buildWhereClause(cursorPayload, direction);

            // Merge cursor WHERE with existing WHERE
            if (Object.keys(cursorWhere).length > 0) {
              Object.assign(where, cursorWhere);
            }

            // For backward pagination, we need to check if there are previous items
            isBackwardCursor = Boolean(before);
          } else {
            // Sort conditions have changed, ignore cursor
            logger.warn('cursor-pagination.sort-mismatch: Cursor invalidated due to sort change');
          }
        } else {
          // Invalid or expired cursor, proceed with offset pagination
          logger.warn('cursor-pagination.invalid-cursor: Falling back to offset');
        }
      }
      
      // Apply read filter if user is authenticated
      if (readFilter && userId) {
        if (readFilter === 'unread') {
          where.articleViews = {
            none: {
              userId: userId,
              isRead: true
            }
          };
        } else if (readFilter === 'read') {
          where.articleViews = {
            some: {
              userId: userId,
              isRead: true
            }
          };
        }
      }
      
      // Apply source filter
      if (sources || sourceId) {
        const sourceIds = sources ? 
          sources.split(',').filter(id => id.trim()) : 
          [sourceId!];
        
        if (sourceIds.length > 0) {
          where.sourceId = {
            in: sourceIds
          };
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
      
      // Apply tag filter with optimized approach (no JOIN)
      if (tag || tags) {
        const tagList = tags ? tags.split(',').filter(t => t.trim()) :
                        tag ? [tag] : [];

        if (tagList.length > 0) {
          let tagIds: string[] = [];
          const tagCacheStartTime = Date.now();
          let cacheHit = false;
          let cacheMissCount = 0;

          try {
            // Try to get tag mapping from cache
            const cachedMapping = await tagCache.getTagMapping(tagList);

            if (cachedMapping) {
              cacheHit = true;
              tagIds = tagList.map(name => cachedMapping[name]).filter(Boolean);

              // Check for missing tags
              const missingTags = tagList.filter(name => !cachedMapping[name]);
              cacheMissCount = missingTags.length;

              if (missingTags.length > 0) {
                // Partial cache miss - fetch missing tags from DB
                const tagRecords = await prisma.tag.findMany({
                  where: {
                    name: {
                      in: missingTags
                    }
                  },
                  select: {
                    id: true,
                    name: true
                  }
                });

                // Build mapping for missing tags
                const missingMapping: { [key: string]: string } = {};
                tagRecords.forEach(t => {
                  missingMapping[t.name] = t.id;
                  tagIds.push(t.id);
                });

                // Update cache with missing tags
                if (Object.keys(missingMapping).length > 0) {
                  await tagCache.setTagMapping(missingTags, missingMapping);
                }
              }
            } else {
              // Complete cache miss - fetch from DB
              cacheHit = false;
              cacheMissCount = tagList.length;

              const tagRecords = await prisma.tag.findMany({
                where: {
                  name: {
                    in: tagList
                  }
                },
                select: {
                  id: true,
                  name: true
                }
              });

              // Build mapping
              const mapping: { [key: string]: string } = {};
              tagRecords.forEach(t => {
                mapping[t.name] = t.id;
                tagIds.push(t.id);
              });

              // Save to cache
              if (Object.keys(mapping).length > 0) {
                await tagCache.setTagMapping(tagList, mapping);
              }
            }
          } catch (cacheError) {
            // Cache error - fallback to direct DB query
            logger.warn(`tag-cache.error: Falling back to direct DB query - ${(cacheError as Error).message}`);

            const tagRecords = await prisma.tag.findMany({
              where: {
                name: {
                  in: tagList
                }
              },
              select: {
                id: true
              }
            });

            tagIds = tagRecords.map(t => t.id);
          } finally {
            // Log cache performance metrics
            const metrics = `tag-cache.metrics: hit=${cacheHit}, miss=${cacheMissCount}/${tagList.length}, duration=${Date.now() - tagCacheStartTime}ms`;
            console.log(metrics);
            logger.info(metrics);
          }
          
          if (tagIds.length === 0) {
            // 未存在タグの場合、ヒットなし
            where.id = { in: [] };
          } else if (tagMode === 'AND') {
            // AND mode: Articles must have all specified tags
            // 既存のAND条件とマージ
            const tagConditions: ArticleWhereInput[] = tagIds.map(tagId => ({
              tags: {
                some: {
                  id: tagId
                }
              }
            }));
            if (!where.AND) {
              where.AND = [];
            } else if (!Array.isArray(where.AND)) {
              where.AND = [where.AND];
            }
            where.AND = [...where.AND, ...tagConditions];
          } else {
            // OR mode: Articles must have at least one of the specified tags
            where.tags = {
              some: {
                id: {
                  in: tagIds
                }
              }
            };
          }
        }
      }
      
      // Apply search filter
      if (search) {
        const keywords = search.trim().split(/[\s　]+/).filter(k => k.length > 0);
        
        if (keywords.length === 1) {
          // Single keyword - OR search
          where.OR = [
            { title: { contains: keywords[0], mode: 'insensitive' } },
            { summary: { contains: keywords[0], mode: 'insensitive' } }
          ];
        } else if (keywords.length > 1) {
          // Multiple keywords - AND search
          // 既存のAND条件とマージ
          const keywordConditions: ArticleWhereInput[] = keywords.map(keyword => ({
            OR: [
              { title: { contains: keyword, mode: 'insensitive' } },
              { summary: { contains: keyword, mode: 'insensitive' } }
            ]
          }));
          if (!where.AND) {
            where.AND = [];
          } else if (!Array.isArray(where.AND)) {
            where.AND = [where.AND];
          }
          where.AND = [...where.AND, ...keywordConditions];
        }
      }
      
      // Apply date range filter
      if (dateRange && dateRange !== 'all') {
        const { getDateRangeFilter } = await import('@/app/lib/date-utils');
        const startDate = getDateRangeFilter(dateRange);
        if (startDate) {
          where.publishedAt = {
            gte: startDate
          };
        }
      }

      // Get total count with caching
      let total: number;

      // 総件数用のキャッシュキーを生成（where条件に基づく）
      const isUserScopedCount = readFilter === 'read' || readFilter === 'unread';
      const countCacheKey = countCache.generateCacheKey('articles:count', {
        params: {
          sources: normalizedSources,
          tag: tag || 'all',
          tags: tags || 'none',
          tagMode: tagMode,
          search: normalizedSearch,
          dateRange: dateRange || 'all',
          readFilter: readFilter || 'all',
          category: category || 'all',
          // read/unread時はユーザー固有の総件数
          userId: isUserScopedCount ? (userId ?? 'anonymous') : 'n/a',
        }
      });

      // Get count from cache or DB
      const cachedCount = await countCache.get<number>(countCacheKey);
      if (cachedCount !== null && cachedCount !== undefined) {
        total = cachedCount;
      } else {
        // Remove cursor-specific WHERE clauses for total count
        const countWhere = { ...where };
        if (useCursor && effectiveCursor) {
          // Remove cursor pagination clauses (OR conditions)
          delete countWhere.OR;
        }
        total = await prisma.article.count({ where: countWhere });
        await countCache.set(countCacheKey, total);
      }

      // Get articles - Optimized query with minimal source relation
      // For cursor pagination, fetch limit+1 to determine hasNextPage
      const fetchLimit = useCursor ? limit + 1 : limit;
      
      const articles = await prisma.article.findMany({
        where,
        select: {
          id: true,
          title: true,
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
            }
          },
          category: true,
          qualityScore: true,
          bookmarks: true,
          userVotes: true,
          createdAt: true,
          updatedAt: true,
          // No tags relation selected (performance optimization)
          // No content field selected (reduces data transfer)
          // No detailedSummary field selected (reduces data transfer)
        },
        orderBy: [
          { [finalSortBy]: sortOrder },
          { id: sortOrder }  // Secondary sort by id for stable cursor pagination
        ],
        skip: useCursor ? 0 : (page - 1) * limit,  // No skip for cursor pagination
        take: fetchLimit,
      });

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
        const articleIds = articles.slice(0, limit).map(a => a.id);  // Use only the requested limit

        logger.info(`DataLoader integration: userId=${userId}, articles=${articleIds.length}`);

        // Create DataLoader instances for this request
        const loaders = createLoaders({ userId });

        if (loaders.favorite && loaders.view) {
          // Fetch favorites and read status using DataLoader (batched)
          const [favoriteStatuses, viewStatuses] = await Promise.all([
            loaders.favorite.loadMany(articleIds),
            loaders.view.loadMany(articleIds)
          ]);

          logger.info(`DataLoader results: favorites=${favoriteStatuses.length}, views=${viewStatuses.length}`);

          // Create maps for O(1) lookup
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

          logger.info(`DataLoader maps: favorites=${favoritesMap.size}, reads=${readStatusMap.size}`);
        }
      } else {
        logger.info(`DataLoader skipped: includeUserData=${includeUserData}, userId=${userId}`);
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
            readFilter,
            category
          },
          hasPreviousPage
        );
        
        pageInfo = {
          hasNextPage: pageData.hasNextPage,
          hasPreviousPage: pageData.hasPreviousPage,
          startCursor: pageData.startCursor,
          endCursor: pageData.endCursor
        };
        
        // Normalize dates and add user data for actual page items
        normalizedArticles = pageData.items.map(article => {
          const normalized: LightweightArticle = {
            ...article,
            publishedAt: article.publishedAt instanceof Date ? article.publishedAt.toISOString() : article.publishedAt,
            createdAt: article.createdAt instanceof Date ? article.createdAt.toISOString() : article.createdAt,
            updatedAt: article.updatedAt instanceof Date ? article.updatedAt.toISOString() : article.updatedAt,
          };

          // Add user-specific data if requested
          if (includeUserData && userId) {
            normalized.isFavorited = favoritesMap.get(article.id) || false;
            normalized.isRead = readStatusMap.get(article.id) || false;
          }

          return normalized;
        });
        
        // Build cursor-based response
        result = {
          items: normalizedArticles as LightweightArticle[],
          total,
          pageInfo,
          // Include legacy pagination fields for backward compatibility
          page: 1,  // Cursor pagination doesn't have traditional page numbers
          limit,
          totalPages: Math.ceil(total / limit),
        };
      } else {
        // Traditional offset pagination - but generate cursor info for transition
        normalizedArticles = articles.map(article => {
          const normalized: LightweightArticle = {
            ...article,
            publishedAt: article.publishedAt instanceof Date ? article.publishedAt.toISOString() : article.publishedAt,
            createdAt: article.createdAt instanceof Date ? article.createdAt.toISOString() : article.createdAt,
            updatedAt: article.updatedAt instanceof Date ? article.updatedAt.toISOString() : article.updatedAt,
          };

          // Add user-specific data if requested
          if (includeUserData && userId) {
            normalized.isFavorited = favoritesMap.get(article.id) || false;
            normalized.isRead = readStatusMap.get(article.id) || false;
          }

          return normalized;
        });

        // Generate cursor info for offset pagination too (for easy transition)
        let pageInfo: PaginatedResponse<LightweightArticle>['pageInfo'] = undefined;
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
              readFilter,
              category
            }
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
              readFilter,
              category
            }
          });

          pageInfo = {
            hasNextPage,
            hasPreviousPage,
            startCursor,
            endCursor
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
      
      // Save to cache - SKIP when includeUserData is true
      if (!includeUserData) {
        await cache.set(cacheKey, result);
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
        userDataIncluded: includeUserData && userId ? true : false,
        paginationMode: useCursor ? 'cursor' : 'offset'
      }
    } as ApiResponse<PaginatedResponse<LightweightArticle>>);
    
    response.headers.set('X-Cache-Status', cacheStatus);
    response.headers.set('X-Response-Time', `${responseTime}ms`);
    response.headers.set('X-API-Version', 'lightweight-v2');
    response.headers.set('X-Pagination-Mode', useCursor ? 'cursor' : 'offset');
    
    return response;
  } catch (error) {
    logger.error({ error }, 'Error fetching lightweight articles');
    
    const dbError = error instanceof Error 
      ? new DatabaseError(`Failed to fetch lightweight articles: ${error.message}`, 'select')
      : new DatabaseError('Failed to fetch lightweight articles', 'select');
    
    const errorResponse = formatErrorResponse(dbError);
    return NextResponse.json(errorResponse, { status: dbError.statusCode });
  }
}
