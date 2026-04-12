import {
  RateLimiterRedis,
  RateLimiterMemory,
  RateLimiterAbstract,
} from 'rate-limiter-flexible';
import { getRedisClient } from '@/lib/redis/client';
import { logger } from '@/lib/logger';
import { getRateLimitConfig } from '@/lib/config/rate-limits';
import { env } from '@/lib/config/env';

/**
 * Rate Limiter for RAG operations and general API protection
 *
 * Uses rate-limiter-flexible with ioredis client for unified Redis architecture.
 * Uses fixed window algorithm for rate limiting (default behavior).
 *
 * Note: Sliding window requires additional configuration (e.g., inMemoryBlockOnConsumed).
 * Current implementation uses fixed window for simplicity and performance.
 *
 * Fallback Strategy:
 * - Test/Development without Redis: RateLimiterMemory (in-memory)
 * - Production with Redis: RateLimiterRedis (ioredis TCP connection)
 *
 * @see .claude/docs/plan/plan_20251019_104507_746_redis-unification-implementation.md
 * @see .claude/docs/plan/plan_20251103_092156_765_rate-limiting-extension-plan.md
 */

/**
 * Memoization cache for rate limiter instances
 * Prevents creating multiple limiter instances for the same config key
 */
const limiterCache = new Map<string, RateLimiterAbstract>();

/**
 * Create rate limiter with fallback strategy
 *
 * @param points - Number of points (requests) allowed
 * @param duration - Duration in seconds
 * @param keyPrefix - Key prefix for Redis storage
 * @param blockDuration - Duration in seconds to block after limit exceeded (default: 0)
 * @returns RateLimiterRedis or RateLimiterMemory based on environment
 */
function createRateLimiter(
  points: number,
  duration: number,
  keyPrefix: string,
  blockDuration: number = 0
): RateLimiterAbstract {
  // Use memory-based limiter in test environment or when Redis URL is not configured
  if (process.env.NODE_ENV === 'test' || !env.REDIS_URL) {
    return new RateLimiterMemory({
      points,
      duration,
      blockDuration,
      keyPrefix,
    });
  }

  // Production: Use Redis-based limiter with ioredis
  try {
    const redisClient = getRedisClient();
    return new RateLimiterRedis({
      storeClient: redisClient,
      points,
      duration,
      blockDuration,
      keyPrefix,
    });
  } catch (error) {
    // Fallback to memory if Redis connection fails
    logger.warn(
      {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        keyPrefix,
      },
      'Rate limiter falling back to memory'
    );
    return new RateLimiterMemory({
      points,
      duration,
      blockDuration,
      keyPrefix,
    });
  }
}

/**
 * Create rate limiter from config key (memoized)
 *
 * Retrieves rate limit config from lib/config/rate-limits.ts and creates
 * a memoized limiter instance. Subsequent calls with the same key return
 * the cached instance.
 *
 * @param configKey - Rate limit config key (e.g., 'auth:login')
 * @returns Memoized RateLimiterAbstract instance
 *
 * @example
 * ```typescript
 * const limiter = createRateLimiterFromConfig('auth:login');
 * await checkRateLimit('user:123', limiter);
 * ```
 */
export function createRateLimiterFromConfig(
  configKey: string
): RateLimiterAbstract {
  if (limiterCache.has(configKey)) {
    return limiterCache.get(configKey)!;
  }

  const config = getRateLimitConfig(configKey);

  // CodexMCP fix: Pass blockDuration to createRateLimiter
  const limiter = createRateLimiter(
    config.points,
    config.duration,
    `ratelimit:${configKey}`,
    config.blockDuration || 0
  );

  limiterCache.set(configKey, limiter);
  return limiter;
}

/**
 * RAG Search Rate Limiter (Vector Search)
 * - 10 requests per minute per user
 * - Fixed window algorithm (default)
 * - TCP connection via ioredis (< 2ms latency) or in-memory fallback
 * - Used by: /api/rag/search (direct vector search, low cost)
 */
export const ragSearchRateLimit = createRateLimiter(
  10,
  60,
  'ratelimit:rag:search'
);

/**
 * RAG Agent Search Rate Limiter
 * - 5 requests per minute per user (stricter than vector search)
 * - Fixed window algorithm
 * - Used by: /api/rag/agent-search (AI agent with GPT-4o-mini)
 *
 * Rationale:
 * - Agent queries are ~75x more expensive than embeddings-only
 * - Cost protection: 5 req/min caps at $0.24/hour/user (vs $0.48 with 10/min)
 * - UX balance: 12 seconds between requests is acceptable for conversational search
 * - Prevents abuse while maintaining responsive experience
 *
 * @see CodexMCP Review: "Tighten agent-specific limit to 3-5/min for cost control"
 */
export const ragAgentSearchRateLimit = createRateLimiter(
  5,
  60,
  'ratelimit:rag:agent'
);

/**
 * Article QA Rate Limiter
 * - 10 requests per minute per user
 *
 * More permissive than article-search to support multi-turn Q&A sessions.
 * Users typically ask 2-5 follow-up questions per article.
 *
 * Rationale:
 * - Higher limit supports conversational flow
 * - Per-article caching reduces actual agent calls
 * - 6-second intervals maintain cost control
 *
 * @see Plan: plan_20251121_085951_509_conversational-learning-coach.md
 */
export const articleQaRateLimit = createRateLimiter(
  10,
  60,
  'ratelimit:rag:article-qa'
);

/**
 * Embedding Generation Rate Limiter
 * - 100 requests per hour per user
 * - Fixed window algorithm (default)
 */
export const embeddingRateLimit = createRateLimiter(
  100,
  3600,
  'ratelimit:embedding'
);

/**
 * Custom error for rate limit exceeded
 *
 * Includes limit, remaining count, and reset time for client retry logic
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public limit: number,
    public remaining: number,
    public reset: Date
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Check rate limit for a given key
 *
 * API Compatibility Layer:
 * - Consumes 1 point from the rate limiter
 * - Throws RateLimitError if limit exceeded (compatible with existing error handling)
 * - Returns void if successful
 *
 * @param limitKey - Unique identifier for rate limiting (e.g., "rag:search:userId")
 * @param ratelimiter - RateLimiterAbstract instance (Redis or Memory)
 * @throws {RateLimitError} - When rate limit is exceeded
 * @throws {Error} - When Redis connection fails
 *
 * @example
 * ```typescript
 * // In API route
 * const session = await getSession();
 * await checkRateLimit(`rag:search:${session.user.id}`, ragSearchRateLimit);
 * ```
 */
export async function checkRateLimit(
  limitKey: string,
  ratelimiter: RateLimiterAbstract
): Promise<{ limit: number; remaining: number; reset: Date }> {
  try {
    // Consume 1 point from the rate limiter
    const res = await ratelimiter.consume(limitKey, 1);

    // Success: return rate limit info for headers
    const limit = ratelimiter.points;
    const remaining = Math.max(0, res.remainingPoints);
    const reset = new Date(Date.now() + res.msBeforeNext);

    return { limit, remaining, reset };
  } catch (rejRes: unknown) {
    // Handle rejection (rate limit exceeded or Redis error)
    if (rejRes instanceof Error) {
      // Redis connection error or other unexpected error
      throw new Error(`Rate limit check failed: ${rejRes.message}`);
    }

    // Rate limit exceeded: rejRes is RateLimiterRes
    // Map to RateLimitError for API compatibility
    const rateLimiterRes = rejRes as {
      msBeforeNext: number;
      remainingPoints: number;
    };
    const resetDate = new Date(Date.now() + rateLimiterRes.msBeforeNext);
    const limit = ratelimiter.points; // Extract configured limit
    const remaining = Math.max(0, rateLimiterRes.remainingPoints); // Never negative

    throw new RateLimitError(
      'Rate limit exceeded',
      limit, // Configured limit (e.g., 10 req/min)
      remaining, // Remaining points (0 or positive)
      resetDate // When the limit resets
    );
  }
}
