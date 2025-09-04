import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import type { PaginatedResponse, ApiResponse } from '@/lib/types/api';
import type { ArticleWithRelations } from '@/types/models';
import { DatabaseError, ValidationError, DuplicateError, formatErrorResponse } from '@/lib/errors';
import { RedisCache } from '@/lib/cache';
import { Prisma, type ArticleCategory } from '@prisma/client';
import { log } from '@/lib/logger';
import { normalizeTagInput } from '@/lib/utils/tag-normalizer';
import { auth } from '@/lib/auth/auth';

type ArticleWhereInput = Prisma.ArticleWhereInput;

// Initialize Redis cache with 5 minutes TTL for articles
const cache = new RedisCache({
  ttl: 300, // 5 minutes
  namespace: '@techtrend/cache:api'
});

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  let cacheStatus = 'MISS';
  
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse pagination params
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    // Support both publishedAt and createdAt for sorting
    const sortBy = searchParams.get('sortBy') || 'publishedAt';
    // Validate sortBy parameter
    const validSortFields = ['publishedAt', 'createdAt', 'qualityScore', 'bookmarks', 'userVotes'];
    const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'publishedAt';
    const rawSortOrder = (searchParams.get('sortOrder') || 'desc').toLowerCase();
    const sortOrder = (rawSortOrder === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
    
    // Parse filters
    const sources = searchParams.get('sources'); // Multiple sources support
    const sourceId = searchParams.get('sourceId'); // Backward compatibility
    const tag = searchParams.get('tag'); // Single tag (backward compatibility)
    const tags = searchParams.get('tags'); // Multiple tags support
    const tagMode = searchParams.get('tagMode') || 'OR'; // Tag filter mode (OR/AND)
    const search = searchParams.get('search');
    const dateRange = searchParams.get('dateRange'); // Date range filter
    const readFilter = searchParams.get('readFilter'); // Read status filter
    const category = searchParams.get('category'); // Category filter
    const includeRelations = searchParams.get('includeRelations') !== 'false'; // Include source and tags by default for backward compatibility
    const includeEmptyContent = searchParams.get('includeEmptyContent') === 'true'; // Filter out empty content by default

    // Generate cache key based on query parameters
    // Normalize search keywords for consistent cache key
    const normalizedSearch = search ? 
      search.trim().split(/[\s　]+/)
        .filter(k => k.length > 0)
        .sort()
        .join(',') : 'none';
    
    // Normalize sources for cache key (sort to ensure consistent key regardless of order)
    const normalizedSources = sources ? 
      sources.split(',').filter(id => id.trim()).sort().join(',') : 
      sourceId || 'all';
    
    // Get session for read filter
    const session = await auth();
    const userId = session?.user?.id;
    
    const cacheKey = cache.generateCacheKey('articles', {
      params: {
        page: page.toString(),
        limit: limit.toString(),
        sortBy: finalSortBy,
        sortOrder,
        sources: normalizedSources, // Use normalized sources
        tag: tag || 'all',
        tags: tags || 'none', // Multiple tags support
        tagMode: tagMode, // Tag filter mode
        search: normalizedSearch,
        dateRange: dateRange || 'all',
        readFilter: readFilter || 'all',
        userId: userId || 'anonymous',
        category: category || 'all',
        includeRelations: includeRelations.toString(), // Add to cache key
        includeEmptyContent: includeEmptyContent.toString() // Add new parameter to cache key
      }
    });

    // Check cache first
    const cachedResult = await cache.get(cacheKey);
    
    let result;
    if (cachedResult) {
      cacheStatus = 'HIT';
      result = cachedResult;
    } else {
      cacheStatus = 'MISS';
      
      // Fetch fresh data
      result = await (async () => {
        // Build where clause
      const where: ArticleWhereInput = {};
      
      // Filter out articles with empty content by default
      if (!includeEmptyContent) {
        // Exclude both null and empty string content
        where.AND = Array.isArray(where.AND)
          ? [...where.AND, 
             { content: { not: null } },
             { content: { not: '' } }
            ]
          : [
             { content: { not: null } },
             { content: { not: '' } }
            ];
      }
      
      // Apply read filter if user is authenticated
      if (readFilter && userId) {
        if (readFilter === 'unread') {
          // 未読記事のみ: ArticleViewが存在しないか、isReadがfalse
          const unreadOr = [
            {
              articleViews: {
                none: {
                  userId: userId
                }
              }
            },
            {
              articleViews: {
                some: {
                  userId: userId,
                  isRead: false
                }
              }
            }
          ];
          where.AND = Array.isArray(where.AND)
            ? [...where.AND, { OR: unreadOr }]
            : [{ OR: unreadOr }];
        } else if (readFilter === 'read') {
          // 既読記事のみ
          where.articleViews = {
            some: {
              userId: userId,
              isRead: true
            }
          };
        }
      }
      // Support multiple sources selection
      if (sources === 'none') {
        // 明示的に「何も選択しない」状態 - 常にfalseになる条件を設定
        // Prismaでは空配列のIN句は正しく動作しない場合があるため、
        // 存在しないIDを使用
        where.sourceId = '__none__';
      } else if (sources) {
        const sourceIds = sources.split(',').filter(id => id.trim());
        if (sourceIds.length > 0) {
          where.sourceId = { in: sourceIds };
        }
      } else if (sourceId) {
        // Backward compatibility with single sourceId
        where.sourceId = sourceId;
      }
      // Tag filtering with backward compatibility
      if (tag) {
        // Single tag (backward compatibility)
        where.tags = {
          some: {
            name: tag
          }
        };
      } else if (tags) {
        // Multiple tags support
        const tagList = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
        if (tagList.length > 0) {
          if (tagMode === 'AND') {
            // AND search: articles with all specified tags
            const tagAnd = tagList.map(tagName => ({
              tags: {
                some: {
                  name: tagName
                }
              }
            }));
            where.AND = Array.isArray(where.AND)
              ? [...where.AND, ...tagAnd]
              : tagAnd;
          } else {
            // OR search: articles with any of the specified tags
            where.tags = {
              some: {
                name: {
                  in: tagList
                }
              }
            };
          }
        }
      }
      
      // Category filter
      if (category && category !== 'all') {
        // Handle 'uncategorized' as null
        if (category === 'uncategorized') {
          where.category = null;
        } else {
          where.category = category as ArticleCategory;
        }
      }
      
      if (search) {
        // Split search string by spaces (both half-width and full-width)
        const keywords = search.trim()
          .split(/[\s　]+/)
          .filter(k => k.length > 0);
        
        if (keywords.length === 1) {
          // Single keyword - maintain existing behavior
          const searchOr: Prisma.ArticleWhereInput[] = [
            { title: { contains: keywords[0], mode: Prisma.QueryMode.insensitive } },
            { summary: { contains: keywords[0], mode: Prisma.QueryMode.insensitive } }
          ];
          where.AND = Array.isArray(where.AND)
            ? [...where.AND, { OR: searchOr }]
            : [{ OR: searchOr }];
        } else if (keywords.length > 1) {
          // Multiple keywords - AND search
          where.AND = keywords.map(keyword => ({
            OR: [
              { title: { contains: keyword, mode: Prisma.QueryMode.insensitive } },
              { summary: { contains: keyword, mode: Prisma.QueryMode.insensitive } }
            ] as Prisma.ArticleWhereInput[]
          }));
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

      // Get total count
      const total = await prisma.article.count({ where });

      // Build select object based on includeRelations parameter
      const selectFields: Prisma.ArticleSelect = {
        id: true,
        title: true,
        url: true,
        summary: true,
        thumbnail: true,
        publishedAt: true,
        qualityScore: true,
        bookmarks: true,
        userVotes: true,
        difficulty: true,
        createdAt: true,
        updatedAt: true,
        sourceId: true,
        summaryVersion: true,
        articleType: true,
        category: true,
        // Exclude: content, detailedSummary for performance
      };

      // Only include relations if requested (default: true for backward compatibility)
      if (includeRelations) {
        selectFields.source = {
          select: {
            id: true,
            name: true,
            type: true,
            url: true,
            enabled: true,
            createdAt: true,
            updatedAt: true,
          },
        };
        selectFields.tags = {
          select: {
            id: true,
            name: true,
          },
        };
      }

      // Get articles
      const articles = await prisma.article.findMany({
        where,
        select: selectFields,
        orderBy: {
          [finalSortBy]: sortOrder,
        },
        skip: (page - 1) * limit,
        take: limit,
      });

      // Return the data to be cached
      return {
        items: articles,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
      })();
      
      // Save to cache
      await cache.set(cacheKey, result);
    }
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Create response with performance headers
    const response = NextResponse.json({
      success: true,
      data: result,
    } as ApiResponse<PaginatedResponse<ArticleWithRelations>>);
    
    response.headers.set('X-Cache-Status', cacheStatus);
    response.headers.set('X-Response-Time', `${responseTime}ms`);
    
    return response;
  } catch (error) {
    log.error('Error fetching articles:', error);
    const dbError = error instanceof Error 
      ? new DatabaseError(`Failed to fetch articles: ${error.message}`, 'select')
      : new DatabaseError('Failed to fetch articles', 'select');
    
    const errorResponse = formatErrorResponse(dbError);
    return NextResponse.json(errorResponse, { status: dbError.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, url, summary, thumbnail, content, publishedAt, sourceId, tagNames = [] } = body;

    // Validate required fields
    if (!title || !url || !sourceId) {
      const validationError = new ValidationError(
        'Missing required fields: title, url, and sourceId are required',
        'requiredFields'
      );
      const errorResponse = formatErrorResponse(validationError);
      return NextResponse.json(errorResponse, { status: validationError.statusCode });
    }

    // Check if article already exists
    const existing = await prisma.article.findUnique({
      where: { url },
    });

    if (existing) {
      const duplicateError = new DuplicateError('Article', 'url', url);
      const errorResponse = formatErrorResponse(duplicateError);
      return NextResponse.json(errorResponse, { status: duplicateError.statusCode });
    }

    // タグを正規化してバリデーション
    const normalizedTags = normalizeTagInput(tagNames);
    
    // タグバリデーションのデッドコードを削除

    // Create article with tags
    const article = await prisma.article.create({
      data: {
        title,
        url,
        summary,
        thumbnail,
        content,
        publishedAt: new Date(publishedAt),
        sourceId,
        tags: {
          connectOrCreate: normalizedTags.map((name: string) => ({
            where: { name },
            create: { name },
          })),
        },
      },
      include: {
        source: true,
        tags: true,
      },
    });

    // Invalidate articles cache when new article is created
    await cache.invalidatePattern('articles:*');

    return NextResponse.json({
      success: true,
      data: article,
    } as ApiResponse<ArticleWithRelations>, { status: 201 });
  } catch (error) {
    log.error('Error creating article:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create article',
      details: error instanceof Error ? error.message : undefined,
    } as ApiResponse<never>, { status: 500 });
  }
}