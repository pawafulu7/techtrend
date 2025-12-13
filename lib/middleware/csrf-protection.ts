/**
 * CSRF Protection Middleware
 *
 * Validates Origin/Referer headers to prevent Cross-Site Request Forgery attacks.
 * Integrates with Auth.js for secure API-to-API communication validation.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/$/, '');
}

function getEffectiveRequestOrigin(request: NextRequest): string {
  // Prefer proxy-aware headers when available (common in reverse-proxy deployments)
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ??
    request.headers.get('host')?.split(',')[0]?.trim();

  if (forwardedProto && forwardedHost) {
    return normalizeOrigin(`${forwardedProto}://${forwardedHost}`);
  }

  // RFC 7239 Forwarded header (best-effort parsing)
  const forwarded = request.headers.get('forwarded');
  if (forwarded) {
    const first = forwarded.split(',')[0] ?? '';
    const parts = first.split(';').map((p) => p.trim());
    const proto = parts.find((p) => p.toLowerCase().startsWith('proto='))?.slice('proto='.length);
    const host = parts.find((p) => p.toLowerCase().startsWith('host='))?.slice('host='.length);
    if (proto && host) {
      return normalizeOrigin(`${proto.replaceAll('"', '')}://${host.replaceAll('"', '')}`);
    }
  }

  return normalizeOrigin(request.nextUrl.origin);
}

/**
 * Paths exempt from CSRF protection
 * These are NextAuth callbacks and public health endpoints
 */
export const CSRF_EXEMPT_PATHS = [
  '/api/auth/callback', // OAuth callbacks only
  '/api/auth/signin', // NextAuth built-in signin
  '/api/auth/signout', // NextAuth built-in signout
  '/api/auth/session', // Session retrieval (GET)
  '/api/auth/csrf', // CSRF token endpoint
  '/api/auth/providers', // Providers list (GET)
  '/api/health', // Health check endpoint
] as const;

/**
 * HTTP methods that require CSRF protection
 */
export const CSRF_PROTECTED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

/**
 * Get allowed origins from environment variables
 */
function getAllowedOrigins(): string[] {
  const origins: string[] = [];

  if (process.env.NEXTAUTH_URL) {
    origins.push(normalizeOrigin(process.env.NEXTAUTH_URL));
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    origins.push(normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL));
  }

  // Development environment origins
  if (process.env.NODE_ENV === 'development') {
    origins.push('http://localhost:3000');
    origins.push('http://localhost:3001');
  }

  // Additional trusted origins from environment
  const trustedOrigins = process.env.CSRF_TRUSTED_ORIGINS;
  if (trustedOrigins) {
    origins.push(...trustedOrigins.split(',').map((o) => normalizeOrigin(o.trim())));
  }

  // Deduplicate origins
  return [...new Set(origins.filter(Boolean))];
}

/**
 * Validate Origin/Referer headers for CSRF protection
 *
 * @param request - NextRequest object
 * @returns true if request origin is valid, false otherwise
 */
export async function validateOrigin(request: NextRequest): Promise<boolean> {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const requestOrigin = getEffectiveRequestOrigin(request);

  // Modern browsers set this header and JS can't spoof it; accept strict same-origin early.
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite === 'same-origin') {
    return true;
  }

  // 1. Same-origin check (highest priority)
  if (origin && normalizeOrigin(origin) === requestOrigin) {
    return true;
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (normalizeOrigin(refererUrl.origin) === requestOrigin) {
        return true;
      }
    } catch {
      // Invalid referer URL, continue to other checks
    }
  }

  // 2. Allowed origins list check
  const allowedOrigins = getAllowedOrigins();

  if (origin && allowedOrigins.includes(normalizeOrigin(origin))) {
    return true;
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (allowedOrigins.includes(normalizeOrigin(refererUrl.origin))) {
        return true;
      }
    } catch {
      // Invalid referer URL
    }
  }

  // 3. Authorization header or no Origin/Referer (server-to-server)
  // Both cases require valid Auth.js session validation
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ') || (!origin && !referer)) {
    try {
      const session = await auth();
      if (session?.user) {
        return true; // Verified API-to-API or server-to-server communication
      }
    } catch {
      // Session validation failed
    }
  }

  return false;
}

/**
 * Check if a path is exempt from CSRF protection
 *
 * @param pathname - Request pathname
 * @returns true if path is exempt
 */
export function isCSRFExemptPath(pathname: string): boolean {
  // Use exact match or prefix-with-slash to prevent false matches
  // e.g., "/api/auth/callback" should match "/api/auth/callback/google"
  // but NOT "/api/auth/callbackadmin"
  return CSRF_EXEMPT_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + '/')
  );
}

/**
 * Check if HTTP method requires CSRF protection
 *
 * @param method - HTTP method
 * @returns true if method requires CSRF protection
 */
export function requiresCSRFProtection(method: string): boolean {
  return (CSRF_PROTECTED_METHODS as readonly string[]).includes(method);
}

/**
 * CSRF protection middleware
 *
 * Use this in middleware.ts or wrap individual route handlers
 *
 * @param request - NextRequest object
 * @returns NextResponse with 403 if CSRF validation fails, undefined if valid
 */
export async function csrfProtection(
  request: NextRequest
): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;

  // Skip if path is exempt
  if (isCSRFExemptPath(pathname)) {
    return null;
  }

  // Skip if method doesn't require protection
  if (!requiresCSRFProtection(request.method)) {
    return null;
  }

  // Validate origin
  const isValid = await validateOrigin(request);

  if (!isValid) {
    return NextResponse.json(
      {
        error: 'CSRF validation failed',
        message: 'Invalid origin or referer header',
      },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Higher-order function to wrap route handlers with CSRF protection
 *
 * @param handler - Route handler function
 * @returns Wrapped handler with CSRF protection
 *
 * @example
 * ```typescript
 * export const POST = withCSRFProtection(async (request: NextRequest) => {
 *   // Handler logic
 * });
 * ```
 */
export function withCSRFProtection<T, C = undefined>(
  handler: C extends undefined
    ? (request: NextRequest) => Promise<T> | T
    : (request: NextRequest, context: C) => Promise<T> | T
): C extends undefined
  ? (request: NextRequest) => Promise<T | NextResponse>
  : (request: NextRequest, context: C) => Promise<T | NextResponse> {
  return (async (request: NextRequest, context?: C) => {
    const csrfResponse = await csrfProtection(request);
    if (csrfResponse) {
      return csrfResponse;
    }
    if (context !== undefined) {
      return (handler as (request: NextRequest, context: C) => Promise<T> | T)(request, context);
    }
    return (handler as (request: NextRequest) => Promise<T> | T)(request);
  }) as C extends undefined
    ? (request: NextRequest) => Promise<T | NextResponse>
    : (request: NextRequest, context: C) => Promise<T | NextResponse>;
}
