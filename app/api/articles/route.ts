import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import type { PaginatedResponse, ApiResponse } from '@/lib/types/api';
import type { ArticleWithRelations } from '@/types/models';
import { DatabaseError, ValidationError, DuplicateError, formatErrorResponse } from '@/lib/errors';
import { LayeredCache, type ArticleQueryParams } from '@/lib/cache/layered-cache';
import { CacheInvalidator } from '@/lib/cache/cache-invalidator';
import { Prisma, ArticleCategory } from '@prisma/client';
import logger from '@/lib/logger';
import { normalizeTagInput } from '@/lib/utils/tag-normalizer';
import { auth } from '@/lib/auth/auth';
import { MetricsCollector, withDbTiming, withCacheTiming } from '@/lib/metrics/performance';
import { getDateRangeFilter } from '@/app/lib/date-utils';

type ArticleWhereInput = Prisma.ArticleWhereInput;

// Initialize Layered cache system for articles
const cache = new LayeredCache();
const cacheInvalidator = new CacheInvalidator();

export async function GET(request: NextRequest) {
  const metrics = new MetricsCollector();
  
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse pagination params with NaN protection
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');
    const parsedPage = Number.parseInt(pageParam ?? '1', 10);
    const parsedLimit = Number.parseInt(limitParam ?? '20', 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 20;
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
    const tagMode = (searchParams.get('tagMode') || 'OR').toUpperCase(); // Tag filter mode (OR/AND), normalized to uppercase
    const search = searchParams.get('search');
    const dateRange = searchParams.get('dateRange'); // Date range filter
    const readFilter = searchParams.get('readFilter'); // Read status filter
    const category = searchParams.get('category'); // Category filter
    const includeRelations = searchParams.get('includeRelations') === 'true'; // Default to false to reduce data transfer
    const includeEmptyContent = searchParams.get('includeEmptyContent') === 'true'; // Filter out empty content by default
    const lightweight = searchParams.get('lightweight') === 'true'; // Ultra-lightweight mode for mobile/bandwidth-conscious clients
    const fields = searchParams.get('fields'); // Comma-separated list of fields to include

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
    
    // Get session only when readFilter requires user context
    const shouldUseUserContext = readFilter === 'read' || readFilter === 'unread';
    const session = shouldUseUserContext ? await auth() : null;
    const userId = session?.user?.id;
    
    // Include userId in cache key only when user context is needed
    const userCtxForKey = shouldUseUserContext ? (userId ?? 'anonymous') : 'n/a';

    // Prepare cache params for LayeredCache
    const cacheParams: ArticleQueryParams = {
      page: page,
      limit: limit,
      sortBy: finalSortBy,
      sortOrder,
      sources: normalizedSources, // Use normalized sources
      sourceId: sourceId || undefined,
      tag: tag || undefined,
      tags: tags || undefined, // Multiple tags support
      tagMode: tagMode || undefined, // Tag filter mode
      search: normalizedSearch === 'none' ? undefined : normalizedSearch,
      dateRange: dateRange || undefined,
      readFilter: readFilter || undefined,
      userId: userCtxForKey === 'n/a' ? undefined : userCtxForKey,
      category: category || undefined,
      includeRelations: includeRelations,
      includeEmptyContent: includeEmptyContent,
      lightweight: lightweight,
      fields: fields || undefined
    };

    // Build data fetcher function for SWR
    const buildResult = async () => {
      // Check for early return case (sources=none)
      if (sources === 'none') {
        // DBアクセスをスキップして空レスポンスを返す
        return {
          items: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        };
      }
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
      // Note: userId is only available when shouldUseUserContext is true
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
      if (sources) {
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
      
      // Category filter with proper validation
      if (category && category !== 'all') {
        // Handle 'uncategorized' as null
        if (category === 'uncategorized') {
          where.category = null;
        } else {
          // Validate category against Prisma enum values dynamically
          const validCategories = Object.values(ArticleCategory);
          
          if (validCategories.includes(category as ArticleCategory)) {
            where.category = category as ArticleCategory;
          } else {
            logger.warn({ category }, 'Invalid category provided');
            // Ignore invalid category filter
          }
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
          const keywordConditions = keywords.map(keyword => ({
            OR: [
              { title: { contains: keyword, mode: Prisma.QueryMode.insensitive } },
              { summary: { contains: keyword, mode: Prisma.QueryMode.insensitive } }
            ] as Prisma.ArticleWhereInput[]
          }));
          where.AND = Array.isArray(where.AND) 
            ? [...where.AND, ...keywordConditions] 
            : keywordConditions;
        }
      }
      
      // Apply date range filter with validation
      if (dateRange && dateRange !== 'all') {
        const startDate = getDateRangeFilter(dateRange);
        if (startDate) {
          // Validate date is not in the future
          const now = new Date();
          const validStartDate = startDate > now ? now : startDate;
          
          where.publishedAt = {
            gte: validStartDate,
            lte: now // Ensure we don't get future dates
          };
        }
      }

      // Get total count
      const total = await withDbTiming(
        metrics,
        () => prisma.article.count({ where }),
        'db_count'
      );

      // Build select object based on parameters
      let selectFields: Prisma.ArticleSelect;

      if (lightweight) {
        // Ultra-lightweight mode: minimum fields only
        selectFields = {
          id: true,
          title: true,
          url: true,
          summary: true,
          publishedAt: true,
          sourceId: true,
        };
      } else if (fields) {
        // Custom field selection
        const fieldList = fields.split(',').map(f => f.trim());
        // 許可フィールドのホワイトリスト
        const allowedSelectableFields = new Set([
          'title','url','summary','thumbnail','publishedAt','qualityScore',
          'bookmarks','userVotes','difficulty','createdAt','updatedAt',
          'sourceId','summaryVersion','articleType','category','detailedSummary'
        ]);
        selectFields = { id: true } as Prisma.ArticleSelect;
        for (const field of fieldList) {
          if (allowedSelectableFields.has(field)) {
            (selectFields as any)[field] = true;
          }
        }
      } else {
        // Standard mode
        selectFields = {
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
      }

      // Only include relations if explicitly requested (default: false to save bandwidth)
      if (includeRelations && !lightweight) {
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
      const articles = await withDbTiming(
        metrics,
        () => prisma.article.findMany({
          where,
          select: selectFields,
          orderBy: {
            [finalSortBy]: sortOrder,
          },
          skip: (page - 1) * limit,
          take: limit,
        }),
        'db_query'
      );

      // Return the data to be cached
      return {
        items: articles,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    };

    // Try to get from layered cache first
    const result = await withCacheTiming(
      metrics,
      async () => {
        // Get data from cache or fetch from database
        const data = await cache.getArticles(cacheParams, buildResult);

        // This will never be null since we're providing a fetcher
        return data!;
      }
    );
    
    // Note: getOrFetch always returns data (either from cache or freshly fetched)
    // We can't distinguish between HIT/MISS/STALE without API changes
    // Temporarily removing misleading cache status to avoid metrics confusion
    // TODO: Enhance getOrFetch to return { data, status } for accurate tracking
    
    // Create response with performance headers
    const response = NextResponse.json({
      success: true,
      data: result,
    } as ApiResponse<PaginatedResponse<ArticleWithRelations>>);

    // Add performance metrics to headers
    metrics.addMetricsToHeaders(response.headers);

    // Add cache headers for browser caching
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    response.headers.set('CDN-Cache-Control', 'max-age=300');
    response.headers.set('Vary', 'Accept-Encoding, Authorization');

    return response;
  } catch (error) {
    logger.error({ err: error }, 'Error fetching articles');
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
    
    // Validate publishedAt
    const parsedPublishedAt = publishedAt ? new Date(publishedAt) : new Date();
    if (Number.isNaN(parsedPublishedAt.getTime())) {
      const validationError = new ValidationError('Invalid publishedAt date format', 'publishedAt');
      const errorResponse = formatErrorResponse(validationError);
      return NextResponse.json(errorResponse, { status: validationError.statusCode });
    }

    // Create article with tags
    const article = await prisma.article.create({
      data: {
        title,
        url,
        summary,
        thumbnail,
        content,
        publishedAt: parsedPublishedAt,
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
    await cacheInvalidator.onArticleCreated(article);

    return NextResponse.json({
      success: true,
      data: article,
    } as ApiResponse<ArticleWithRelations>, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, 'Error creating article');
    return NextResponse.json({
      success: false,
      error: 'Failed to create article',
      details: error instanceof Error ? error.message : undefined,
    } as ApiResponse<never>, { status: 500 });
  }
}