/**
 * Prisma Error Handler
 *
 * Handles Prisma-specific errors and converts them to appropriate HTTP responses.
 * Specifically handles FK constraint violations that can occur when a user is
 * deleted during an active session (race condition).
 */

import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';

/**
 * Error codes that indicate a user-related constraint violation
 */
const USER_FK_CONSTRAINTS = [
  'Favorite_userId_fkey',
  'ArticleView_userId_fkey',
  'UserCategoryPreference_userId_fkey',
  'Account_userId_fkey',
  'Session_userId_fkey',
  'UserSourcePreset_userId_fkey',
];

/**
 * Handle Prisma errors and return appropriate HTTP response
 *
 * @param error - The error to handle
 * @returns NextResponse if error was handled, null otherwise
 *
 * @example
 * ```typescript
 * try {
 *   await prisma.favorite.create({ data: { userId, articleId } });
 * } catch (error) {
 *   const handled = handlePrismaError(error);
 *   if (handled) return handled;
 *   throw error;
 * }
 * ```
 */
export function handlePrismaError(error: unknown): NextResponse | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return null;
  }

  // P2003: Foreign key constraint failed
  if (error.code === 'P2003') {
    const constraintName =
      (error.meta?.field_name as string) ||
      (error.meta?.constraint as string) ||
      'unknown';

    // Check if it's a user-related FK constraint
    const isUserFkViolation = USER_FK_CONSTRAINTS.some((fk) =>
      constraintName.includes(fk.replace('_userId_fkey', ''))
    );

    if (isUserFkViolation) {
      logger.warn(
        {
          errorCode: error.code,
          constraint: constraintName,
          meta: error.meta,
        },
        'FK constraint violation - user may have been deleted during request'
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

    // Other FK violations - log but don't handle specially
    logger.error(
      {
        errorCode: error.code,
        constraint: constraintName,
        meta: error.meta,
      },
      'FK constraint violation'
    );

    return NextResponse.json(
      {
        error: 'Database constraint violation',
        code: 'FK_CONSTRAINT_ERROR',
      },
      { status: 400 }
    );
  }

  // P2025: Record not found (can also indicate deleted user)
  if (error.code === 'P2025') {
    logger.warn(
      {
        errorCode: error.code,
        meta: error.meta,
      },
      'Record not found - may be a deleted resource'
    );

    return NextResponse.json(
      {
        error: 'Resource not found',
        code: 'NOT_FOUND',
      },
      { status: 404 }
    );
  }

  // Unhandled Prisma error
  return null;
}

/**
 * Check if an error is a Prisma FK constraint violation
 */
export function isPrismaFkError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  );
}

/**
 * Check if an error is a Prisma record not found error
 */
export function isPrismaNotFoundError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}
