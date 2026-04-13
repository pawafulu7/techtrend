import { NextRequest, NextResponse } from 'next/server';
import { resolveSession } from './session-context';
import { getUserAuthData } from '@/lib/auth/user-auth-cache';
import logger from '@/lib/logger';

type Handler = (
  request: NextRequest,
  context?: any
) => Promise<Response> | Response;

/**
 * Admin authentication middleware
 *
 * Uses DB-backed role verification via getUserAuthData() instead of JWT role.
 * This ensures immediate role demotion enforcement (max 120s cache TTL vs 30-day JWT).
 *
 * Integrates with SessionContext: reuses session from upstream middleware
 * (e.g., withCSRFProtection) via resolveSession(), falling back to auth()
 * if no context is available.
 *
 * Returns:
 * - 401 if not authenticated or user deleted
 * - 403 if not admin role
 * - Passes session in context on success
 */
export function withAdminAuth(handler: Handler): Handler {
  return async (request: NextRequest, context?: any) => {
    const ctx = context?.requestHeaders
      ? context
      : { ...context, requestHeaders: request.headers };
    const session = await resolveSession(ctx);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required.' },
        { status: 401 }
      );
    }

    const authData = await getUserAuthData(session.user.id);

    if (!authData || authData.deletedAt) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          code: 'USER_DELETED',
          message: 'Your session is no longer valid.',
          requiresLogout: true,
        },
        { status: 401 }
      );
    }

    if (authData.role !== 'admin') {
      logger.warn(
        {
          userId: session.user.id,
          role: authData.role,
          path: request.nextUrl.pathname,
        },
        'Non-admin user attempted admin API access'
      );
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required.' },
        { status: 403 }
      );
    }

    return handler(request, { ...context, session });
  };
}
