/**
 * Session Context for Middleware Chain
 *
 * Provides utilities for sharing session data across middleware chain
 * to avoid redundant auth() calls.
 *
 * Usage:
 * - Create context at outermost middleware using extendWithSessionContext()
 * - Pass context through middleware chain
 * - Use resolveSession(context) instead of auth() directly
 */

import type { Session } from 'next-auth';
import { auth } from '@/lib/auth/auth';

/**
 * Session sharing context for middleware chain
 * Used to limit auth() calls to once per request
 */
export type SessionContext = {
  session?: Session | null;
  sessionPromise?: Promise<Session | null>;
};

/**
 * Resolve session from context or fetch from auth()
 *
 * - If context.session exists, reuse it
 * - If not, create sessionPromise and share it
 * - Once resolved, cache session in context
 *
 * @param context - Optional session context from upstream middleware
 * @returns Session or null
 */
export async function resolveSession(
  context?: SessionContext
): Promise<Session | null> {
  // Early return: no context provided
  if (!context) return auth();

  // Cache hit: session already resolved
  if (context.session !== undefined) return context.session;

  // Lazy evaluation: create promise on first call only
  if (!context.sessionPromise) {
    context.sessionPromise = auth().then((session) => {
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
 * @param context - Existing context object (may include params, etc.)
 * @returns Extended context with SessionContext fields
 */
export function extendWithSessionContext<T extends object>(
  context?: T
): T & SessionContext {
  return { ...context, ...createSessionContext() } as T & SessionContext;
}
