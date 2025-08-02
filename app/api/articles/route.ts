import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import type { PaginationParams, PaginatedResponse, ApiResponse } from '@/lib/types/api';
import type { ArticleWithRelations } from '@/types/models';
import { DatabaseError, ValidationError, DuplicateError, formatErrorResponse } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse pagination params
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const sortBy = searchParams.get('sortBy') || 'publishedAt';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';
    
    // Parse filters
    const sourceId = searchParams.get('sourceId');
    const tag = searchParams.get('tag');
    const search = searchParams.get('search');

    // Build where clause
    const where: ArticleWhereInput = {};
    if (sourceId) {
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
      where.OR = [
        { title: { contains: search } },
        { summary: { contains: search } }
      ];
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
        publishedAt: true,
        qualityScore: true,
        bookmarks: true,
        userVotes: true,
        difficulty: true,
        createdAt: true,
        updatedAt: true,
        sourceId: true,
        // Exclude: content, thumbnail, detailedSummary
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
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    const response: PaginatedResponse<ArticleWithRelations> = {
      items: articles,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    return NextResponse.json({
      success: true,
      data: response,
    } as ApiResponse<PaginatedResponse<ArticleWithRelations>>);
  } catch (error) {
    console.error('Error fetching articles:', error);
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
          connectOrCreate: tagNames.map((name: string) => ({
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

    return NextResponse.json({
      success: true,
      data: article,
    } as ApiResponse<ArticleWithRelations>, { status: 201 });
  } catch (error) {
    console.error('Error creating article:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create article',
      details: error instanceof Error ? error.message : undefined,
    } as ApiResponse<never>, { status: 500 });
  }
}