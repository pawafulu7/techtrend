/**
 * POST Handler for Articles API
 *
 * Handles article creation with validation,
 * tag processing, and cache invalidation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import type { ApiResponse } from '@/lib/types/api';
import type { ArticleWithRelations } from '@/types/models';
import { ValidationError, DuplicateError, formatErrorResponse } from '@/lib/errors';
import { CacheInvalidator } from '@/lib/cache/cache-invalidator';
import { normalizeTagInput } from '@/lib/utils/tag-normalizer';
import logger from '@/lib/logger';

// Initialize cache invalidator
const cacheInvalidator = new CacheInvalidator();

/**
 * Main POST handler for creating articles
 */
export async function handlePost(request: NextRequest): Promise<NextResponse> {
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

    // Normalize and validate tags
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

    return NextResponse.json(
      {
        success: true,
        data: article,
      } as ApiResponse<ArticleWithRelations>,
      { status: 201 }
    );
  } catch (error) {
    logger.error({ err: error }, 'Error creating article');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create article',
        details: error instanceof Error ? error.message : undefined,
      } as ApiResponse<never>,
      { status: 500 }
    );
  }
}
