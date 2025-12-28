/**
 * Comments API Route
 *
 * POST /api/comments - Create a new comment
 * GET /api/comments - Get comments for an article
 *
 * Task 3.1, 3.2: POST/GET /api/comments
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import {
  withUserValidation,
  type WithUserValidationContext,
} from '@/lib/middleware/with-user-validation';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { commentService } from '@/lib/comments/comment-service';
import { handlePrismaError } from '@/lib/utils/prisma-error-handler';

// =============================================================================
// Request Schemas
// =============================================================================

const CreateCommentSchema = z.object({
  articleId: z.string().min(1, 'articleId is required'),
  content: z.string().min(1, 'content is required'),
  visibility: z.enum(['PRIVATE', 'PUBLIC']),
});

const GetCommentsQuerySchema = z.object({
  articleId: z.string().min(1, 'articleId is required'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// =============================================================================
// Handlers
// =============================================================================

/**
 * POST /api/comments
 *
 * Creates a new comment for an article.
 *
 * Middleware: CSRF + Auth + Rate Limit (write:comment)
 */
async function postHandler(
  request: NextRequest,
  context: WithUserValidationContext
): Promise<NextResponse> {
  const { validatedUser } = context;

  try {
    // 1. Parse and validate request body
    const body = await request.json();
    const parseResult = CreateCommentSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0];
      return NextResponse.json(
        { error: firstError.message },
        { status: 400 }
      );
    }

    const { articleId, content, visibility } = parseResult.data;

    // 2. Create comment via service
    const result = await commentService.createComment({
      articleId,
      userId: validatedUser.id,
      content,
      visibility,
    });

    // 3. Handle result
    if (!result.success) {
      switch (result.error.type) {
        case 'ARTICLE_NOT_FOUND':
          return NextResponse.json(
            { error: 'Article not found' },
            { status: 404 }
          );
        case 'VALIDATION_ERROR':
          return NextResponse.json(
            { error: result.error.message },
            { status: 400 }
          );
        default:
          return NextResponse.json(
            { error: result.error.message },
            { status: 500 }
          );
      }
    }

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    const prismaError = handlePrismaError(error);
    if (prismaError) {
      return prismaError;
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/comments
 *
 * Gets comments for an article (user's own comments only in MVP).
 *
 * Query params:
 * - articleId: string (required)
 * - cursor: string (optional)
 * - limit: number (optional, default 20)
 *
 * Middleware: Auth only (no CSRF for GET)
 */
async function getHandler(
  request: NextRequest,
  context: WithUserValidationContext
): Promise<NextResponse> {
  const { validatedUser } = context;

  try {
    // 1. Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = {
      articleId: searchParams.get('articleId') || '',
      cursor: searchParams.get('cursor') || undefined,
      limit: searchParams.get('limit') || '20',
    };

    const parseResult = GetCommentsQuerySchema.safeParse(queryParams);

    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0];
      return NextResponse.json(
        { error: firstError.message },
        { status: 400 }
      );
    }

    const { articleId, cursor, limit } = parseResult.data;

    // 2. Get comments via service
    const result = await commentService.getCommentsByArticle(
      articleId,
      validatedUser.id,
      { cursor, limit }
    );

    // 3. Handle result
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(result.data);
  } catch (error) {
    const prismaError = handlePrismaError(error);
    if (prismaError) {
      return prismaError;
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// =============================================================================
// Export with Middleware
// =============================================================================

// GET: Auth only (CSRF not required for read operations)
export const GET = withUserValidation(getHandler);

// POST: CSRF + Auth + Rate Limit
export const POST = withCSRFProtection(
  withUserValidation(
    withRateLimit('write:comment', postHandler)
  )
);
