/**
 * User Validation Middleware
 *
 * Validates that the authenticated user exists in the database and is not deleted.
 * This prevents FK constraint violations when users are deleted but still have
 * valid JWT tokens.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { logger } from '@/lib/logger';
import { resolveSession, type SessionContext } from './session-context';

type RouteHandler = (
  request: NextRequest,
  context?: any
) => Promise<Response> | Response;

export interface ValidatedUser {
  id: string;
  deletedAt: Date | null;
}

export interface WithUserValidationContext {
  session: {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
    };
  };
  validatedUser: ValidatedUser;
}

/**
 * Higher-order function to validate user existence before API execution
 *
 * Wraps a Next.js route handler with user validation logic. Automatically:
 * - Fetches session and validates user exists in DB
 * - Checks if user has been soft-deleted (deletedAt)
 * - Returns 401 with requiresLogout flag if user is deleted/missing
 * - Passes validated user info to handler context
 *
 * @param handler - Next.js route handler
 * @returns Wrapped route handler with user validation
 *
 * @example
 * ```typescript
 * export const POST = withUserValidation(async (request, context) => {
 *   // context.validatedUser is guaranteed to exist
 *   const { validatedUser, session } = context;
 *   await prisma.favorite.create({
 *     data: { userId: validatedUser.id, articleId }
 *   });
 *   return NextResponse.json({ success: true });
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Combine with rate limiting
 * export const POST = withRateLimit(
 *   'favorites:create',
 *   withUserValidation(postHandler)
 * );
 * ```
 */
export function withUserValidation(handler: RouteHandler): RouteHandler {
  return async (request: NextRequest, context?: SessionContext) => {
    // Get session - reuse from context if available (auth() call optimization)
    const session = await resolveSession(context);

    // Check if user is authenticated
    if (!session?.user?.id) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          code: 'NOT_AUTHENTICATED',
          message: 'Authentication required',
        },
        { status: 401 }
      );
    }

    // Validate user exists in database and is not deleted
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, deletedAt: true },
    });

    // User not found or has been deleted
    if (!user || user.deletedAt) {
      logger.warn(
        {
          userId: session.user.id,
          userExists: !!user,
          deletedAt: user?.deletedAt,
          path: request.nextUrl.pathname,
          method: request.method,
        },
        'Deleted or missing user attempted API access'
      );

      return NextResponse.json(
        {
          error: 'Session invalid',
          code: 'USER_DELETED',
          message: 'Your session is no longer valid. Please sign in again.',
          requiresLogout: true,
        },
        { status: 401 }
      );
    }

    // Call handler with validated user context
    const enhancedContext: WithUserValidationContext = {
      ...context,
      session,
      validatedUser: user,
    };

    return handler(request, enhancedContext);
  };
}

/**
 * Validate user without wrapping - for use in handlers that need more control
 *
 * @param session - Auth.js session
 * @returns ValidatedUser if valid, null otherwise
 */
export async function validateUser(
  session: { user?: { id?: string } } | null
): Promise<ValidatedUser | null> {
  if (!session?.user?.id) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, deletedAt: true },
  });

  if (!user || user.deletedAt) {
    return null;
  }

  return user;
}

/**
 * Create a 401 response for deleted/invalid user
 */
export function createUserDeletedResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'Session invalid',
      code: 'USER_DELETED',
      message: 'Your session is no longer valid. Please sign in again.',
      requiresLogout: true,
    },
    { status: 401 }
  );
}
