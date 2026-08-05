/**
 * POST Handler for Articles API
 *
 * Handles article creation with validation,
 * tag processing, and cache invalidation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import type { ApiResponse } from '@/lib/types/api';
import type { ArticleWithRelations } from '@/types/models';
import {
  ValidationError,
  DuplicateError,
  formatErrorResponse,
} from '@/lib/errors';
import { CacheInvalidator } from '@/lib/cache/cache-invalidator';
import { normalizeTagInput } from '@/lib/utils/tag/tag-normalizer';
import { env } from '@/lib/config/env';
import logger from '@/lib/logger';

// Initialize cache invalidator
const cacheInvalidator = new CacheInvalidator();

const httpUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }, 'URL must use http or https protocol');

const createArticleSchema = z.object({
  title: z.string().min(1).max(500),
  url: httpUrlSchema,
  sourceId: z.string().min(1),
  summary: z.string().max(10000).optional(),
  content: z.string().max(500000).optional(),
  thumbnail: httpUrlSchema.optional(),
  publishedAt: z
    .string()
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: 'Invalid publishedAt date format',
    })
    .optional(),
  tagNames: z.array(z.string().max(30)).max(20).optional().default([]),
});

/**
 * Convert a Zod validation error into the project's ValidationError shape.
 * `field` carries the first offending path; `details` carries the full
 * flattened error so multi-field violations aren't silently dropped.
 */
function toValidationError(zodError: z.ZodError): ValidationError {
  const firstIssue = zodError.issues[0];
  const field = firstIssue ? firstIssue.path.join('.') : undefined;
  return new ValidationError(
    'Invalid request body',
    field || undefined,
    zodError.flatten() as unknown as Record<string, unknown>
  );
}

/**
 * Main POST handler for creating articles
 */
export async function handlePost(request: NextRequest): Promise<NextResponse> {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      const validationError = new ValidationError('Invalid JSON body', 'body');
      const errorResponse = formatErrorResponse(validationError);
      return NextResponse.json(errorResponse, {
        status: validationError.statusCode,
      });
    }

    const parseResult = createArticleSchema.safeParse(rawBody);
    if (!parseResult.success) {
      const validationError = toValidationError(parseResult.error);
      const errorResponse = formatErrorResponse(validationError);
      return NextResponse.json(errorResponse, {
        status: validationError.statusCode,
      });
    }

    const {
      title,
      url,
      summary,
      thumbnail,
      content,
      publishedAt,
      sourceId,
      tagNames,
    } = parseResult.data;

    // Verify sourceId exists
    const sourceExists = await prisma.source.findUnique({
      where: { id: sourceId },
      select: { id: true },
    });

    if (!sourceExists) {
      const validationError = new ValidationError(
        `Source with id '${sourceId}' does not exist`,
        'sourceId'
      );
      const errorResponse = formatErrorResponse(validationError);
      return NextResponse.json(errorResponse, {
        status: validationError.statusCode,
      });
    }

    // Check if article already exists
    const existing = await prisma.article.findUnique({
      where: { url },
    });

    if (existing) {
      const duplicateError = new DuplicateError('Article', 'url', url);
      const errorResponse = formatErrorResponse(duplicateError);
      return NextResponse.json(errorResponse, {
        status: duplicateError.statusCode,
      });
    }

    // Normalize and validate tags
    const normalizedTags = normalizeTagInput(tagNames);

    // Resolve publishedAt (Zod already validated the string is a parseable date)
    const parsedPublishedAt = publishedAt ? new Date(publishedAt) : new Date();

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
    const isProduction = env.NODE_ENV === 'production';
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create article',
        details: isProduction
          ? undefined
          : error instanceof Error
            ? error.message
            : undefined,
      } as ApiResponse<never>,
      { status: 500 }
    );
  }
}
