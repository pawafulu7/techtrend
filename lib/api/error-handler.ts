/**
 * Centralized API error handling utilities
 * Provides consistent error responses across all API routes
 */

import { NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { Prisma } from '@prisma/client';
import type { Session } from 'next-auth';

// Error types
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

// Error response interface
interface ErrorResponse {
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
  timestamp: string;
  path?: string;
}

/**
 * Format error response
 */
function formatErrorResponse(
  error: Error | ApiError,
  path?: string
): ErrorResponse {
  const response: ErrorResponse = {
    error: {
      message: error.message,
    },
    timestamp: new Date().toISOString(),
  };

  if (path) {
    response.path = path;
  }

  if (error instanceof ApiError) {
    response.error.code = error.code;
    if (error.details) {
      response.error.details = error.details;
    }
  }

  return response;
}

/**
 * Handle API errors and return appropriate responses
 */
export function handleApiError(
  error: unknown,
  path?: string
): NextResponse<ErrorResponse> {
  // Log error for monitoring
    error,
    path,
    timestamp: new Date().toISOString(),
  });

  // Handle known error types
  if (error instanceof ApiError) {
    return NextResponse.json(
      formatErrorResponse(error, path),
      { status: error.statusCode }
    );
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const validationError = new ValidationError(
      'Validation failed',
      error.issues.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }))
    );
    return NextResponse.json(
      formatErrorResponse(validationError, path),
      { status: 400 }
    );
  }

  // Handle Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': // Unique constraint violation
        return NextResponse.json(
          formatErrorResponse(
            new ValidationError('Duplicate entry', {
              field: error.meta?.target,
            }),
            path
          ),
          { status: 400 }
        );
      case 'P2025': // Record not found
        return NextResponse.json(
          formatErrorResponse(new NotFoundError(), path),
          { status: 404 }
        );
      case 'P2003': // Foreign key constraint violation
        return NextResponse.json(
          formatErrorResponse(
            new ValidationError('Invalid reference', {
              field: error.meta?.field_name,
            }),
            path
          ),
          { status: 400 }
        );
      default:
        return NextResponse.json(
          formatErrorResponse(
            new ApiError('Database error', 500, error.code),
            path
          ),
          { status: 500 }
        );
    }
  }

  // Handle generic errors
  if (error instanceof Error) {
    return NextResponse.json(
      formatErrorResponse(
        new ApiError(
          process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : error.message
        ),
        path
      ),
      { status: 500 }
    );
  }

  // Handle unknown errors
  return NextResponse.json(
    formatErrorResponse(
      new ApiError('An unexpected error occurred'),
      path
    ),
    { status: 500 }
  );
}

/**
 * Async error wrapper for API routes
 */
export function withErrorHandler<T extends (...args: unknown[]) => Promise<unknown>>(
  handler: T
): T {
  return (async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error);
    }
  }) as T;
}

/**
 * Validate request data with Zod schema
 */
export async function validateRequest<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<T> {
  try {
    const data = await request.json();
    return schema.parse(data);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ValidationError('Invalid JSON');
    }
    throw error;
  }
}

/**
 * Check if user is authenticated
 */
export function requireAuth(session: Session | null): void {
  if (!session?.user) {
    throw new UnauthorizedError('Authentication required');
  }
}

/**
 * Check if user has required role
 */
export function requireRole(session: Session | null, role: string): void {
  requireAuth(session);
  if (!session || session.user.role !== role) {
    throw new ForbiddenError(`Role '${role}' required`);
  }
}

/**
 * Rate limiting helper
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  identifier: string,
  limit: number = 100,
  windowMs: number = 60000
): void {
  const now = Date.now();
  const userLimit = rateLimitMap.get(identifier);

  if (!userLimit || userLimit.resetTime < now) {
    rateLimitMap.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return;
  }

  if (userLimit.count >= limit) {
    const resetIn = Math.ceil((userLimit.resetTime - now) / 1000);
    throw new RateLimitError(
      `Rate limit exceeded. Try again in ${resetIn} seconds`
    );
  }

  userLimit.count++;
}