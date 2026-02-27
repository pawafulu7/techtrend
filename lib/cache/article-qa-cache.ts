/**
 * Article QA Cache
 *
 * Caches Article QA agent responses for identical (articleId, query) pairs.
 * Medium TTL (5 minutes) to balance freshness and performance.
 *
 * Features:
 * - Article-scoped caching with locale and updatedAt tracking
 * - Token limit enforcement (max 10,000 tokens per entry)
 * - Query normalization (case-insensitive, whitespace, punctuation)
 * - Graceful degradation (continues without caching if Redis unavailable)
 *
 * @module article-qa-cache
 */

import { getRedisClient } from '@/lib/redis-di';
import { logger } from '@/lib/logger';
import { countTokens } from '@/lib/utils/chunking';
import { CACHE_TTL } from './constants';

/**
 * Article QA Cache
 *
 * Caches responses for article-specific Q&A sessions.
 * Invalidates cache when article is updated (via updatedAt timestamp).
 */
export class ArticleQACache {
  private readonly prefix = 'article-qa:';
  private readonly ttl = CACHE_TTL.SHORT;
  private readonly maxTokensPerEntry = 10000; // CodexMCP recommendation

  /**
   * Get cached response for an article query
   *
   * @param articleId - Article ID
   * @param query - User query
   * @param locale - User locale ('ja' or 'en')
   * @param updatedAt - Article last updated timestamp
   * @returns Cached response or null if not found/error
   */
  async get(
    articleId: string,
    query: string,
    locale: 'ja' | 'en',
    updatedAt: Date
  ): Promise<string | null> {
    try {
      const redis = await getRedisClient();
      if (!redis) {
        logger.debug('Redis not available, cache disabled');
        return null;
      }

      const key = this.getCacheKey(articleId, query, locale, updatedAt);
      const cached = await redis.get(key);

      if (cached) {
        logger.debug(
          {
            articleId,
            query: query.substring(0, 50),
            locale,
            hit: true,
            cacheKey: key,
          },
          'Article QA cache hit'
        );
      }

      return cached;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          articleId,
          query: query.substring(0, 50),
        },
        'Article QA cache get failed'
      );
      return null; // Fail gracefully (continue without caching)
    }
  }

  /**
   * Cache article QA response
   *
   * Enforces token limit to prevent excessive cache growth.
   *
   * @param articleId - Article ID
   * @param query - User query
   * @param locale - User locale ('ja' or 'en')
   * @param updatedAt - Article last updated timestamp
   * @param response - Agent response text
   */
  async set(
    articleId: string,
    query: string,
    locale: 'ja' | 'en',
    updatedAt: Date,
    response: string
  ): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (!redis) {
        logger.debug('Redis not available, skipping cache set');
        return;
      }

      // Enforce token limit
      const tokenCount = countTokens(response);
      if (tokenCount > this.maxTokensPerEntry) {
        logger.warn(
          {
            articleId,
            query: query.substring(0, 50),
            tokenCount,
            maxTokens: this.maxTokensPerEntry,
          },
          'Article QA response exceeds token limit, skipping cache'
        );
        return;
      }

      const key = this.getCacheKey(articleId, query, locale, updatedAt);
      await redis.setex(key, this.ttl, response);

      logger.debug(
        {
          articleId,
          query: query.substring(0, 50),
          locale,
          responseLength: response.length,
          tokenCount,
          ttl: this.ttl,
          cacheKey: key,
        },
        'Article QA response cached'
      );
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          articleId,
          query: query.substring(0, 50),
        },
        'Article QA cache set failed'
      );
      // Continue without caching (non-critical error)
    }
  }

  /**
   * Invalidate cache for a specific article query
   *
   * @param articleId - Article ID
   * @param query - User query
   * @param locale - User locale
   * @param updatedAt - Article last updated timestamp
   */
  async invalidate(
    articleId: string,
    query: string,
    locale: 'ja' | 'en',
    updatedAt: Date
  ): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (!redis) return;

      const key = this.getCacheKey(articleId, query, locale, updatedAt);
      await redis.del(key);

      logger.debug(
        {
          articleId,
          query: query.substring(0, 50),
        },
        'Article QA cache invalidated'
      );
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          articleId,
          query: query.substring(0, 50),
        },
        'Article QA cache invalidation failed'
      );
    }
  }

  /**
   * Invalidate all cache entries for a specific article
   *
   * Useful when article content is updated.
   * Uses SCAN instead of KEYS to avoid blocking Redis.
   *
   * @param articleId - Article ID
   */
  async invalidateArticle(articleId: string): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (!redis) return;

      // Use SCAN instead of KEYS to avoid blocking Redis
      const pattern = `${this.prefix}${articleId}:*`;
      let cursor = '0';
      const keysToDelete: string[] = [];

      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          keysToDelete.push(...keys);
        }
      } while (cursor !== '0');

      if (keysToDelete.length > 0) {
        await redis.del(...keysToDelete);
        logger.debug(
          {
            articleId,
            keysDeleted: keysToDelete.length,
          },
          'Article QA cache invalidated for article'
        );
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          articleId,
        },
        'Article QA cache invalidation (article) failed'
      );
    }
  }

  /**
   * Get cache key for an article query
   *
   * Key format: article-qa:{articleId}:{normalizedQuery}:{locale}:{updatedAtMs}
   *
   * @param articleId - Article ID
   * @param query - User query
   * @param locale - User locale
   * @param updatedAt - Article last updated timestamp
   * @returns Cache key
   */
  private getCacheKey(
    articleId: string,
    query: string,
    locale: 'ja' | 'en',
    updatedAt: Date
  ): string {
    const normalized = this.normalizeQuery(query);
    const updatedAtMs = updatedAt.getTime();
    return `${this.prefix}${articleId}:${normalized}:${locale}:${updatedAtMs}`;
  }

  /**
   * Normalize query for cache key generation
   *
   * Normalization strategy:
   * - Lowercase (case-insensitive matching)
   * - Trim whitespace
   * - Collapse multiple spaces to single space
   * - Remove punctuation (!?。、；：etc.)
   * - Preserve ASCII dot (.) to avoid version number collisions (e.g., v1.0 vs v10)
   *
   * @param query - Raw query
   * @returns Normalized query
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[!?。、；：！？、]/g, '');
  }
}
