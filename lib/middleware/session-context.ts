/**
 * Session Context for Middleware Chain
 *
 * Provides utilities for sharing session data across middleware chain
 * to avoid redundant auth.api.getSession() calls.
 *
 * Usage:
 * - Create context at outermost middleware using extendWithSessionContext()
 * - Pass context through middleware chain
 * - Use resolveSession(context) instead of auth.api.getSession() directly
 */

import type { Auth } from '@/lib/auth/auth';

type BetterAuthSession = Awaited<ReturnType<Auth['api']['getSession']>> | null;

/**
 * Session sharing context for middleware chain
 * Used to limit auth.api.getSession() calls to once per request
 */
export type SessionContext = {
  session?: BetterAuthSession;
  sessionPromise?: Promise<BetterAuthSession>;
  requestHeaders?: Headers;
};

/**
 * Resolve session from context or fetch from auth.api.getSession()
 *
 * - If context.session exists, reuse it
 * - If not, create sessionPromise and share it
 * - Once resolved, cache session in context
 *
 * @param context - Optional session context from upstream middleware (must include requestHeaders)
 * @returns Session or null
 */
export async function resolveSession(
  context?: SessionContext
): Promise<BetterAuthSession> {
  const fetchSession = async (): Promise<BetterAuthSession> => {
    if (!context?.requestHeaders) return null;
    const { auth } = await import('@/lib/auth/auth');
    return auth.api.getSession({ headers: context.requestHeaders });
  };

  // Early return: no context provided
  if (!context) return fetchSession();

  // Cache hit: session already resolved
  if (context.session !== undefined) return context.session;

  // Lazy evaluation: create promise on first call only
  if (!context.sessionPromise) {
    context.sessionPromise = fetchSession().then((session) => {
      context.session = session ?? null;
      return context.session;
    });
  }

  return context.sessionPromise;
}

/**
 * Create a new session context
 * Should be called once at the outermost middleware
 */
export function createSessionContext(): SessionContext {
  return {};
}

/**
 * Extend existing context with SessionContext
 * Preserves existing properties like params from Next.js dynamic routes
 *
 * Note: Existing session/sessionPromise properties in context are preserved
 * (SessionContext defaults are spread first, then context overwrites)
 *
 * @param context - Existing context object (may include params, etc.)
 * @returns Extended context with SessionContext fields
 */
export function extendWithSessionContext<T extends object>(
  context?: T,
  requestHeaders?: Headers
): T & SessionContext {
  return { ...createSessionContext(), requestHeaders, ...context } as T &
    SessionContext;
}

/**
 * Resolve session, injecting request headers if context lacks them.
 * Eliminates repeated boilerplate in middleware wrappers.
 */
export async function resolveSessionFromRequest(
  context: SessionContext | undefined,
  fallbackHeaders: Headers
): Promise<BetterAuthSession> {
  const ctx = context?.requestHeaders
    ? context
    : { ...context, requestHeaders: fallbackHeaders };
  return resolveSession(ctx);
}
