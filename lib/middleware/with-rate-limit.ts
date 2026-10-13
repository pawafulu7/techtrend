import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RateLimitError } from '@/lib/rate-limiter';
import {
  getRateLimitConfig,
  type RateLimitPolicyKey,
} from '@/lib/config/rate-limits';
import { createRateLimiterFromConfig } from '@/lib/rate-limiter';
import { trace } from '@opentelemetry/api';
import { resolveSessionFromRequest } from './session-context';
import { AUTH_COOKIES } from '@/lib/config/auth-cookies';
import logger from '@/lib/logger';

type RouteHandler = (
  request: NextRequest,
  context?: any
) => Promise<Response> | Response;

interface WithRateLimitOptions {
  keyResolver?: (request: NextRequest, session: any) => Promise<string>;
  onAllowed?: (limitInfo: {
    limit: number;
    remaining: number;
    reset: Date;
  }) => void;
  onBlocked?: (error: RateLimitError) => void;
  /**
   * false にするとセッションを引かない（既定は引く）。keyStrategy が 'ip' か 'anonymous' で、
   * handler もセッションを使わない、未ログインから大量に届く API に使う。引くと、ログイン中の
   * 送り手ごとに認証の DB を引き、認証の失敗に巻き込まれて本来の処理まで落ちるため
   */
  resolveSession?: boolean;
  /**
   * true にすると、制限の確認そのものが失敗したとき（Redis の障害など）に、制限をかけずに handler を
   * 通す（既定は例外を投げて 500）。制限を超えたときは true でも 429 を返す。Redis が落ちたときにこそ
   * 見たい、管理者だけの監視 API に使う（認証を外側に置き、誰でも素通りできる形にしない）
   */
  allowOnLimiterError?: boolean;
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
  configKey: RateLimitPolicyKey,
  handler: RouteHandler,
  options?: WithRateLimitOptions
): RouteHandler {
  return async (request: NextRequest, context?: any) => {
    const span = trace.getActiveSpan();

    try {
      // Get config and create limiter (memoized)
      const config = getRateLimitConfig(configKey);
      const limiter = createRateLimiterFromConfig(configKey);

      // Resolve session from context or fetch via auth() (SessionContext optimization)
      const session =
        options?.resolveSession === false
          ? undefined
          : await resolveSessionFromRequest(context, request.headers);

      // Resolve identity key
      const limitKey = options?.keyResolver
        ? await options.keyResolver(request, session)
        : await resolveDefaultKey(request, config.keyStrategy, session);

      // Check rate limit
      let rateLimitInfo: Awaited<ReturnType<typeof checkRateLimit>>;
      try {
        rateLimitInfo = await checkRateLimit(limitKey, limiter);
      } catch (error) {
        if (error instanceof RateLimitError || !options?.allowOnLimiterError) {
          throw error;
        }
        // 制限の確認ができなかった（Redis の障害など）。制限のヘッダーは付けずに handler を通す
        logger.warn(
          { err: error, configKey },
          'Rate limit check failed; allowing request without rate limit'
        );
        span?.addEvent('ratelimit.check_failed', { configKey });
        return handler(request, { ...context, session });
      }

      // Success: Execute handler with session in context (SessionContext shared across chain)
      const response = await handler(request, { ...context, session });
      // handler の中で別の制限に当たって 429 を返したときは、その制限のヘッダーを残す
      // （上書きすると、本文と食い違う外側の制限の残りが載る）
      if (!response.headers.has('X-RateLimit-Limit')) {
        response.headers.set(
          'X-RateLimit-Limit',
          rateLimitInfo.limit.toString()
        );
        response.headers.set(
          'X-RateLimit-Remaining',
          rateLimitInfo.remaining.toString()
        );
        response.headers.set(
          'X-RateLimit-Reset',
          rateLimitInfo.reset.toISOString()
        );
      }

      // Telemetry (debug level - only log allowed events at debug to reduce noise)
      // limitKey（ip:<IP> や user:<ID>）は載せない。短いハッシュでは IPv4 を総当たりで戻せるため
      span?.addEvent('ratelimit.allowed', {
        configKey,
        keyStrategy: config.keyStrategy,
        remaining: rateLimitInfo.remaining,
      });

      if (options?.onAllowed) {
        options.onAllowed(rateLimitInfo);
      }

      return response;
    } catch (error) {
      if (error instanceof RateLimitError) {
        // Rate limit exceeded
        const retryAfter = Math.ceil(
          (error.reset.getTime() - Date.now()) / 1000
        );

        // Telemetry (always log blocked events)
        span?.addEvent('ratelimit.blocked', {
          configKey,
          limit: error.limit,
          retryAfter,
        });

        if (options?.onBlocked) {
          options.onBlocked(error);
        }

        return createRateLimitedResponse(error, retryAfter);
      }

      // Other errors: propagate to Next.js error handling
      throw error;
    }
  };
}

/**
 * 制限を超えたときの 429 応答（RFC 6585）
 *
 * withRateLimit を通さずに handler の中で checkRateLimit を呼ぶルートも、同じ形で返すために使う
 */
export function createRateLimitedResponse(
  error: RateLimitError,
  retryAfter: number = Math.ceil((error.reset.getTime() - Date.now()) / 1000)
): NextResponse {
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
 * NextRequest の `ip` は Next.js 15 で削除された（node_modules/next/dist/docs/01-app/02-guides/
 * upgrading/version-15.md の「NextRequest Geolocation」）ので、x-forwarded-for の先頭を使う。
 * x-forwarded-for は、信頼できるプロキシ（Vercel など）が上書きする前提で使っている
 */
function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
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
      const sessionCookie = request.cookies.get(AUTH_COOKIES.sessionToken);
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
