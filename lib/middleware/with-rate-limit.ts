import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { checkRateLimit, RateLimitError } from '@/lib/rate-limiter';
import { getRateLimitConfig } from '@/lib/config/rate-limits';
import { createRateLimiterFromConfig } from '@/lib/rate-limiter';
import { trace } from '@opentelemetry/api';

type RouteHandler = (request: NextRequest, context?: any) => Promise<Response> | Response;

interface WithRateLimitOptions {
  keyResolver?: (request: NextRequest, session: any) => Promise<string>;
  onAllowed?: (limitInfo: { limit: number; remaining: number; reset: Date }) => void;
  onBlocked?: (error: RateLimitError) => void;
}

/**
 * Higher-order function to apply rate limiting to API routes
 *
 * Wraps a Next.js route handler with rate limiting logic. Automatically:
 * - Fetches session once and reuses it
 * - Resolves identity key based on config strategy
 * - Checks rate limit using existing lib/rate-limiter.ts
 * - Sets standard rate limit headers
 * - Returns 429 with Retry-After on limit exceeded
 * - Integrates with OpenTelemetry for observability
 *
 * @param configKey - Rate limit config key from lib/config/rate-limits.ts
 * @param handler - Next.js route handler
 * @param options - Optional configuration
 * @returns Wrapped route handler with rate limiting
 *
 * @example
 * // Apply to auth endpoint
 * export const POST = withRateLimit('auth:login', async (request) => {
 *   const body = await request.json();
 *   // ... authentication logic
 *   return NextResponse.json({ success: true });
 * });
 *
 * @example
 * // With custom key resolver
 * export const POST = withRateLimit(
 *   'ai:summary',
 *   async (request) => { ... },
 *   {
 *     keyResolver: async (req, session) => `custom:${session?.user?.email}`,
 *   }
 * );
 */
export function withRateLimit(
  configKey: string,
  handler: RouteHandler,
  options?: WithRateLimitOptions
): RouteHandler {
  return async (request: NextRequest, context?: any) => {
    const span = trace.getActiveSpan();

    try {
      // Get config and create limiter (memoized)
      const config = getRateLimitConfig(configKey);
      const limiter = createRateLimiterFromConfig(configKey);

      // Fetch session once and reuse (CodexMCP fix: avoid double auth() calls)
      const session = await auth();

      // Resolve identity key
      const limitKey = options?.keyResolver
        ? await options.keyResolver(request, session)
        : await resolveDefaultKey(request, config.keyStrategy, session);

      // Check rate limit
      const rateLimitInfo = await checkRateLimit(limitKey, limiter);

      // Success: Execute handler and set rate limit headers
      const response = await handler(request, context);
      response.headers.set('X-RateLimit-Limit', rateLimitInfo.limit.toString());
      response.headers.set('X-RateLimit-Remaining', rateLimitInfo.remaining.toString());
      response.headers.set('X-RateLimit-Reset', rateLimitInfo.reset.toISOString());

      // Telemetry (debug level - only log allowed events at debug to reduce noise)
      span?.addEvent('ratelimit.allowed', {
        configKey,
        limitKey,
        remaining: rateLimitInfo.remaining,
      });

      if (options?.onAllowed) {
        options.onAllowed(rateLimitInfo);
      }

      return response;
    } catch (error) {
      if (error instanceof RateLimitError) {
        // Rate limit exceeded
        const retryAfter = Math.ceil((error.reset.getTime() - Date.now()) / 1000);

        // Telemetry (always log blocked events)
        span?.addEvent('ratelimit.blocked', {
          configKey,
          limit: error.limit,
          retryAfter,
        });

        if (options?.onBlocked) {
          options.onBlocked(error);
        }

        // Standardized error response (RFC 6585 compliant)
        return NextResponse.json(
          {
            error: 'rate_limited',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter,
            limit: error.limit,
            reset: error.reset.toISOString(),
          },
          {
            status: 429,
            headers: {
              'Retry-After': retryAfter.toString(),
              'X-RateLimit-Limit': error.limit.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': error.reset.toISOString(),
            },
          }
        );
      }

      // Other errors: propagate to Next.js error handling
      throw error;
    }
  };
}

/**
 * Resolve rate limit key based on strategy
 *
 * @param request - Next.js request
 * @param strategy - Key strategy from config
 * @param session - Auth.js session (pre-fetched to avoid double auth() calls)
 * @returns Rate limit key string
 */
/**
 * Extract client IP from request
 *
 * Next.js 15 only populates request.ip in runtime (middleware/edge).
 * For Node.js API Routes and tests, fallback to x-forwarded-for header.
 */
function getClientIP(request: NextRequest): string {
  return (
    request.ip ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

async function resolveDefaultKey(
  request: NextRequest,
  strategy: 'user' | 'session' | 'ip' | 'anonymous' | undefined,
  session: any
): Promise<string> {
  const clientIP = getClientIP(request);

  switch (strategy) {
    case 'user': {
      if (!session?.user?.id) {
        // Fallback to IP for anonymous users
        return `anon:${clientIP}`;
      }
      return `user:${session.user.id}`;
    }

    case 'session': {
      const sessionCookie =
        request.cookies.get('authjs.session-token') ||
        request.cookies.get('__Secure-authjs.session-token');
      return `session:${sessionCookie?.value || 'anonymous'}`;
    }

    case 'ip':
      return `ip:${clientIP}`;

    case 'anonymous':
      return 'anonymous';

    default:
      return `ip:${clientIP}`;
  }
}
