import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import type { PaginationParams, PaginatedResponse, ApiResponse } from '@/lib/types/api';
import type { ArticleWithRelations } from '@/types/models';
import { DatabaseError, ValidationError, DuplicateError, formatErrorResponse } from '@/lib/errors';
import { RedisCache } from '@/lib/cache';
import type { Prisma } from '@prisma/client';
import { log } from '@/lib/logger';
import { normalizeTagInput } from '@/lib/utils/tag-normalizer';

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
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';
    
    // Parse filters
    const sources = searchParams.get('sources'); // Multiple sources support
    const sourceId = searchParams.get('sourceId'); // Backward compatibility
    const tag = searchParams.get('tag');
    const search = searchParams.get('search');

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
    
    const cacheKey = cache.generateCacheKey('articles', {
      params: {
        page: page.toString(),
        limit: limit.toString(),
        sortBy: finalSortBy,
        sortOrder,
        sources: normalizedSources, // Use normalized sources
        tag: tag || 'all',
        search: normalizedSearch
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
      if (tag) {
        where.tags = {
          some: {
            name: tag
          }
        };
      }
      if (search) {
        // Split search string by spaces (both half-width and full-width)
        const keywords = search.trim()
          .split(/[\s　]+/)
          .filter(k => k.length > 0);
        
        if (keywords.length === 1) {
          // Single keyword - maintain existing behavior
          where.OR = [
            { title: { contains: keywords[0] } },
            { summary: { contains: keywords[0] } }
          ];
        } else if (keywords.length > 1) {
          // Multiple keywords - AND search
          where.AND = keywords.map(keyword => ({
            OR: [
              { title: { contains: keyword } },
              { summary: { contains: keyword } }
            ]
          }));
        }
      }

      // Get total count
      const total = await prisma.article.count({ where });

      // Get articles
      const articles = await prisma.article.findMany({
        where,
        select: {
          id: true,
          title: true,
          url: true,
          summary: true,
          thumbnail: true,  // thumbnailを追加
          publishedAt: true,
          qualityScore: true,
          bookmarks: true,
          userVotes: true,
          difficulty: true,
          createdAt: true,
          updatedAt: true,
          sourceId: true,
          summaryVersion: true,  // summaryVersionを追加
          articleType: true,     // articleTypeを追加
          // Exclude: content, detailedSummary
          source: {
            select: {
              id: true,
              name: true,
              type: true,
              url: true,
              enabled: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          tags: {
            select: {
              id: true,
              name: true,
            },
          },
        },
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
    
    // 不正なタグが含まれていた場合は警告（開発環境のみ）
    if (process.env.NODE_ENV !== 'production' && tagNames) {
      if (typeof tagNames === 'string') {
        console.info(`[Articles API] Tag string converted to array: "${tagNames}" -> ${JSON.stringify(normalizedTags)}`);
      }
    }

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