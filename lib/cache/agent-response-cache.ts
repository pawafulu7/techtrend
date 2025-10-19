import { getRedisClient } from '@/lib/redis-di';
import { logger } from '@/lib/logger';

/**
 * Agent Response Cache
 *
 * Caches agent-generated responses for identical queries.
 * Short TTL (60s) to balance freshness and performance.
 *
 * Features:
 * - Query normalization (case-insensitive, whitespace, punctuation)
 * - Graceful degradation (continues without caching if Redis unavailable)
 * - Structured logging
 *
 * @see CodexMCP Review: "Two-level caching strategy"
 * @see Plan: plan_20251019_141946_039_rag-agent-fuzzy-search.md:409-469
 */
export class AgentResponseCache {
  private readonly prefix = 'agent:response:';
  private readonly ttl = 60; // 60 seconds (short-lived)

  /**
   * Get cached response for a query
   *
   * @param query - User query
   * @returns Cached response or null if not found/error
   */
  async get(query: string): Promise<string | null> {
    try {
      const redis = await getRedisClient();
      if (!redis) {
        logger.debug('Redis not available, cache disabled');
        return null;
      }

      const key = this.getCacheKey(query);
      const cached = await redis.get(key);

      if (cached) {
        logger.debug(
          {
            query: query.substring(0, 50),
            hit: true,
            cacheKey: key,
          },
          'Agent response cache hit'
        );
      }

      return cached;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          query: query.substring(0, 50),
        },
        'Agent cache get failed'
      );
      return null; // Fail gracefully (continue without caching)
    }
  }

  /**
   * Cache agent response
   *
   * @param query - User query
   * @param response - Agent response text
   */
  async set(query: string, response: string): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (!redis) {
        logger.debug('Redis not available, skipping cache set');
        return;
      }

      const key = this.getCacheKey(query);
      await redis.setex(key, this.ttl, response);

      logger.debug(
        {
          query: query.substring(0, 50),
          responseLength: response.length,
          ttl: this.ttl,
          cacheKey: key,
        },
        'Agent response cached'
      );
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          query: query.substring(0, 50),
        },
        'Agent cache set failed'
      );
      // Continue without caching (non-critical error)
    }
  }

  /**
   * Invalidate cache for a specific query
   *
   * @param query - User query
   */
  async invalidate(query: string): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (!redis) return;

      const key = this.getCacheKey(query);
      await redis.del(key);

      logger.debug({ query: query.substring(0, 50) }, 'Agent cache invalidated');
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          query: query.substring(0, 50),
        },
        'Agent cache invalidation failed'
      );
    }
  }

  /**
   * Get cache key for a query
   *
   * @param query - User query
   * @returns Normalized cache key
   */
  private getCacheKey(query: string): string {
    const normalized = this.normalizeQuery(query);
    return `${this.prefix}${normalized}`;
  }

  /**
   * Normalize query for cache key generation
   *
   * Normalization strategy:
   * - Lowercase (case-insensitive matching)
   * - Trim whitespace
   * - Collapse multiple spaces to single space
   * - Remove punctuation (!?。、；：etc.)
   *
   * @param query - Raw query
   * @returns Normalized query
   *
   * @example
   * ```typescript
   * normalizeQuery('  React   Performance!  ')
   * // => 'react performance'
   * ```
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')              // Collapse whitespace
      .replace(/[!?。、；：！？、]/g, ''); // Remove punctuation
  }
}
