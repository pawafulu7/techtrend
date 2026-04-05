/**
 * Comments Cache
 *
 * Manages Redis cache for comment lists with:
 * - User-specific, article-specific cache keys
 * - Cursor-based pagination support
 * - TTL: 60 seconds (private comments)
 * - Cache invalidation on create/update/delete
 */

import { RedisCache } from './index';
import { CACHE_TTL } from './constants';
import logger from '@/lib/logger';
import type { PaginatedComments } from '@/lib/comments/comment-service';

// =============================================================================
// Types
// =============================================================================

interface CacheStats {
  hits: number;
  misses: number;
}

// =============================================================================
// Cache Implementation
// =============================================================================

export class CommentsCache {
  private cache: RedisCache;

  constructor() {
    // TTL: 60 seconds (private comments update frequently)
    this.cache = new RedisCache({
      ttl: CACHE_TTL.VERY_SHORT,
      namespace: '@techtrend/cache:comments',
    });
  }

  /**
   * Get cached comments for article and user
   */
  async getComments(
    articleId: string,
    userId: string,
    cursor: string | null,
    limit: number
  ): Promise<PaginatedComments | null> {
    const cacheKey = this.getCacheKey(articleId, userId, cursor, limit);

    try {
      const cached = await this.cache.get<PaginatedComments>(cacheKey);

      if (cached) {
        logger.debug({ articleId, userId, hit: true }, 'Comments cache hit');
        return cached;
      }

      logger.debug({ articleId, userId, hit: false }, 'Comments cache miss');
      return null;
    } catch (error) {
      logger.error(
        { err: error, articleId, userId },
        'Failed to get comments from cache'
      );
      return null;
    }
  }

  /**
   * Set cached comments for article and user
   */
  async setComments(
    articleId: string,
    userId: string,
    cursor: string | null,
    limit: number,
    data: PaginatedComments
  ): Promise<void> {
    const cacheKey = this.getCacheKey(articleId, userId, cursor, limit);

    try {
      await this.cache.set(cacheKey, data);
      logger.debug(
        { articleId, userId, commentsCount: data.comments.length },
        'Comments cached'
      );
    } catch (error) {
      logger.error({ err: error, articleId, userId }, 'Failed to cache comments');
    }
  }

  /**
   * Invalidate all cached comments for article and user
   *
   * Called on create/update/delete operations
   */
  async invalidate(articleId: string, userId: string): Promise<void> {
    const pattern = `a:${articleId}:u:${userId}:*`;

    try {
      await this.cache.invalidatePattern(pattern);
      logger.debug({ articleId, userId }, 'Comments cache invalidated');
    } catch (error) {
      logger.error(
        { err: error, articleId, userId },
        'Failed to invalidate comments cache'
      );
    }
  }

  /**
   * Invalidate all comments cache (for maintenance)
   */
  async clearAll(): Promise<void> {
    try {
      await this.cache.invalidatePattern('*');
      logger.info('All comments cache cleared');
    } catch (error) {
      logger.error({ err: error }, 'Failed to clear all comments cache');
      throw error;
    }
  }

  /**
   * Generate cache key
   *
   * Pattern: a:{articleId}:u:{userId}:c:{cursor|first}:l:{limit}
   */
  private getCacheKey(
    articleId: string,
    userId: string,
    cursor: string | null,
    limit: number
  ): string {
    const cursorKey = cursor ?? 'first';
    return `a:${articleId}:u:${userId}:c:${cursorKey}:l:${limit}`;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return this.cache.getStats() as CacheStats;
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.cache.resetStats();
  }
}

// Export singleton instance
export const commentsCache = new CommentsCache();
