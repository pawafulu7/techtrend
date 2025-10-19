import { RateLimiterRedis, RateLimiterMemory, RateLimiterAbstract } from 'rate-limiter-flexible';
import { getRedisClient } from '@/lib/redis/client';
import { logger } from '@/lib/logger';

/**
 * Rate Limiter for RAG operations
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
 */

/**
 * Create rate limiter with fallback strategy
 *
 * @param points - Number of points (requests) allowed
 * @param duration - Duration in seconds
 * @param keyPrefix - Key prefix for Redis storage
 * @returns RateLimiterRedis or RateLimiterMemory based on environment
 */
function createRateLimiter(
  points: number,
  duration: number,
  keyPrefix: string
): RateLimiterAbstract {
  // Use memory-based limiter in test environment or when Redis URL is not configured
  if (process.env.NODE_ENV === 'test' || !process.env.REDIS_URL) {
    return new RateLimiterMemory({
      points,
      duration,
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
      blockDuration: 0,
      keyPrefix,
    });
  } catch (error) {
    // Fallback to memory if Redis connection fails
    logger.warn({
      error: error instanceof Error ? error.message : 'Unknown error',
      keyPrefix,
    }, 'Rate limiter falling back to memory');
    return new RateLimiterMemory({
      points,
      duration,
      keyPrefix,
    });
  }
}

/**
 * RAG Search Rate Limiter
 * - 10 requests per minute per user
 * - Fixed window algorithm (default)
 * - TCP connection via ioredis (< 2ms latency) or in-memory fallback
 */
export const ragSearchRateLimit = createRateLimiter(10, 60, 'ratelimit:rag:search');

/**
 * Embedding Generation Rate Limiter
 * - 100 requests per hour per user
 * - Fixed window algorithm (default)
 */
export const embeddingRateLimit = createRateLimiter(100, 3600, 'ratelimit:embedding');

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
 * const session = await auth();
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
      throw new Error(
        `Rate limit check failed: ${rejRes.message}`
      );
    }

    // Rate limit exceeded: rejRes is RateLimiterRes
    // Map to RateLimitError for API compatibility
    const rateLimiterRes = rejRes as { msBeforeNext: number; remainingPoints: number };
    const resetDate = new Date(Date.now() + rateLimiterRes.msBeforeNext);
    const limit = ratelimiter.points; // Extract configured limit
    const remaining = Math.max(0, rateLimiterRes.remainingPoints); // Never negative

    throw new RateLimitError(
      'Rate limit exceeded',
      limit,      // Configured limit (e.g., 10 req/min)
      remaining,  // Remaining points (0 or positive)
      resetDate   // When the limit resets
    );
  }
}
