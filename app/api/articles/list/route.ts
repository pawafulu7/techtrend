import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { PaginatedResponse, ApiResponse } from '@/lib/types/api';
import { DatabaseError, formatErrorResponse } from '@/lib/errors';
import { RedisCache } from '@/lib/cache';
import type { Prisma, ArticleCategory } from '@prisma/client';
import logger from '@/lib/logger';
import { auth } from '@/lib/auth/auth';
import { createLoaders } from '@/lib/dataloader';

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
    
    // Parse pagination params
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const sortBy = searchParams.get('sortBy') || 'publishedAt';
    const validSortFields = ['publishedAt', 'createdAt', 'qualityScore', 'bookmarks', 'userVotes'];
    const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'publishedAt';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';
    
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

    const cacheKey = cache.generateCacheKey('articles:lightweight', {
      params: {
        page: page.toString(),
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

    let result;
    if (cachedResult) {
      cacheStatus = 'HIT';
      result = cachedResult;
    } else {
      cacheStatus = 'MISS';
      
      // Build where clause
      const where: ArticleWhereInput = {};
      
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
      
      // Apply category filter
      if (category && category !== 'all') {
        // Handle 'uncategorized' as null
        if (category === 'uncategorized') {
          where.category = null;
        } else {
          where.category = category as ArticleCategory;
        }
      }
      
      // Apply tag filter with optimized approach (no JOIN)
      if (tag || tags) {
        const tagList = tags ? tags.split(',').filter(t => t.trim()) : 
                        tag ? [tag] : [];
        
        if (tagList.length > 0) {
          // Get tag IDs first
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
          
          const tagIds = tagRecords.map(t => t.id);
          
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

      // Get total count with caching（page=1の時のみ実際にカウント、それ以外はキャッシュから取得）
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

      // page=1の時は実際にカウントを取得してキャッシュに保存
      if (page === 1) {
        // キャッシュから取得を試みる
        const cachedCount = await countCache.get<number>(countCacheKey);
        if (cachedCount !== null && cachedCount !== undefined) {
          total = cachedCount;
        } else {
          // キャッシュミスの場合、DBからカウント取得
          total = await prisma.article.count({ where });
          // キャッシュに保存
          await countCache.set(countCacheKey, total);
        }
      } else {
        // page > 1: キャッシュから取得、なければDB。クライアントtotalは信用しない
        const cachedCount = await countCache.get<number>(countCacheKey);
        if (cachedCount !== null && cachedCount !== undefined) {
          total = cachedCount;
        } else {
          // キャッシュミスの場合、DBから取得
          total = await prisma.article.count({ where });
          await countCache.set(countCacheKey, total);
        }
      }

      // Get articles - Optimized query with minimal source relation
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
        orderBy: {
          [finalSortBy]: sortOrder,
        },
        skip: (page - 1) * limit,
        take: limit,
      });

      // Fetch user-specific data if requested
      const favoritesMap: Map<string, boolean> = new Map();
      const readStatusMap: Map<string, boolean> = new Map();

      if (includeUserData && userId) {
        const articleIds = articles.map(a => a.id);

        // Create DataLoader instances for this request
        const loaders = createLoaders({ userId });

        if (loaders.favorite && loaders.view) {
          // Fetch favorites and read status using DataLoader (batched)
          const [favoriteStatuses, viewStatuses] = await Promise.all([
            loaders.favorite.loadMany(articleIds),
            loaders.view.loadMany(articleIds)
          ]);

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
        }
      }

      // Normalize dates to ISO strings for consistency and add user data
      const normalizedArticles = articles.map(article => {
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

      // Return the data to be cached
      result = {
        items: normalizedArticles as LightweightArticle[],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
      
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
        userDataIncluded: includeUserData && userId ? true : false
      }
    } as ApiResponse<PaginatedResponse<LightweightArticle>>);
    
    response.headers.set('X-Cache-Status', cacheStatus);
    response.headers.set('X-Response-Time', `${responseTime}ms`);
    response.headers.set('X-API-Version', 'lightweight-v1');
    
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
