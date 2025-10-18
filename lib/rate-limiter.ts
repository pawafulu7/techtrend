import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rate Limiter for RAG operations
 *
 * Development: redis = null (rate limiting disabled)
 * Production: Upstash Redis with sliding window
 *
 * @see .claude/docs/plan/plan_20251018_104352_577_mastra-rag-final-secure.md:606-664
 */

// Initialize Redis client
// If UPSTASH_REDIS_REST_URL is not set, redis will be null and rate limiting will be disabled
const redis = process.env.UPSTASH_REDIS_REST_URL
  ? Redis.fromEnv()
  : null;

// Rate limiter for RAG search operations
// 10 requests per minute per user
export const ragSearchRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  analytics: true,
  prefix: 'ratelimit:rag:search',
}) : null;

// Rate limiter for embedding generation operations
// 100 embeddings per hour per operation
export const embeddingRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 h'),
  analytics: true,
  prefix: 'ratelimit:embedding',
}) : null;

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
 * @param limitKey - Rate limit key (e.g., "rag:search:userId")
 * @param ratelimiter - Ratelimit instance or null
 * @throws {RateLimitError} If rate limit is exceeded
 * @throws {Error} If ratelimiter.limit() fails unexpectedly
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
  ratelimiter: Ratelimit | null
): Promise<void> {
  if (!ratelimiter) {
    // Development mode without Redis: skip rate limiting
    return;
  }

  try {
    const { success, limit, remaining, reset } = await ratelimiter.limit(limitKey);

    if (!success) {
      throw new RateLimitError(
        'Rate limit exceeded',
        limit,
        remaining,
        new Date(reset)
      );
    }
  } catch (error) {
    // Re-throw RateLimitError as-is
    if (error instanceof RateLimitError) {
      throw error;
    }

    // Unexpected errors (network, Upstash API failure, etc.) should be handled as 500
    throw new Error(
      `Rate limit check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
