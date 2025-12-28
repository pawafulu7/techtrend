/**
 * Comments [id] API Route
 *
 * PUT /api/comments/[id] - Update a comment
 * DELETE /api/comments/[id] - Delete a comment (soft delete)
 *
 * Task 3.3: PUT/DELETE /api/comments/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';
import {
  withUserValidation,
  type WithUserValidationContext,
} from '@/lib/middleware/with-user-validation';
import { commentService } from '@/lib/comments/comment-service';
import { handlePrismaError } from '@/lib/utils/prisma-error-handler';

// =============================================================================
// Types
// =============================================================================

interface RouteContext extends WithUserValidationContext {
  params: Promise<{ id: string }>;
}

// =============================================================================
// Request Schemas
// =============================================================================

const UpdateCommentSchema = z.object({
  content: z.string().min(1, 'content is required').optional(),
  visibility: z.enum(['PRIVATE', 'PUBLIC']).optional(),
});

// =============================================================================
// Handlers
// =============================================================================

/**
 * PUT /api/comments/[id]
 *
 * Updates a comment (content and/or visibility).
 * Only the comment owner can update.
 *
 * Middleware: CSRF + Auth
 */
async function putHandler(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const { validatedUser } = context;

  try {
    // 1. Get comment ID from params
    const { id } = await context.params;

    // 2. Parse and validate request body
    const body = await request.json();
    const parseResult = UpdateCommentSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0];
      return NextResponse.json(
        { error: firstError.message },
        { status: 400 }
      );
    }

    const { content, visibility } = parseResult.data;

    // 3. Update comment via service
    const result = await commentService.updateComment(id, validatedUser.id, {
      content,
      visibility,
    });

    // 4. Handle result
    if (!result.success) {
      switch (result.error.type) {
        case 'NOT_FOUND':
          return NextResponse.json(
            { error: 'Comment not found' },
            { status: 404 }
          );
        case 'FORBIDDEN':
          return NextResponse.json(
            { error: 'Permission denied' },
            { status: 403 }
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

/**
 * DELETE /api/comments/[id]
 *
 * Soft deletes a comment (sets deletedAt).
 * Only the comment owner can delete.
 *
 * Middleware: CSRF + Auth
 */
async function deleteHandler(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const { validatedUser } = context;

  try {
    // 1. Get comment ID from params
    const { id } = await context.params;

    // 2. Delete comment via service
    const result = await commentService.deleteComment(id, validatedUser.id);

    // 3. Handle result
    if (!result.success) {
      switch (result.error.type) {
        case 'NOT_FOUND':
          return NextResponse.json(
            { error: 'Comment not found' },
            { status: 404 }
          );
        case 'FORBIDDEN':
          return NextResponse.json(
            { error: 'Permission denied' },
            { status: 403 }
          );
        default:
          return NextResponse.json(
            { error: result.error.message },
            { status: 500 }
          );
      }
    }

    // 204 No Content
    return new NextResponse(null, { status: 204 });
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

// PUT: CSRF + Auth
export const PUT = withCSRFProtection(withUserValidation(putHandler));

// DELETE: CSRF + Auth
export const DELETE = withCSRFProtection(withUserValidation(deleteHandler));
