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
 * - Graceful degradation (inherited from RedisCache)
 * - Standardized namespace management and stats tracking
 *
 * @module article-qa-cache
 */

import { RedisCache } from './index';
import { CACHE_TTL } from './constants';
import { CachedAIResponse } from './types';
import { normalizeQuery } from './normalize-query';
import { hashSensitiveValue, logger } from '@/lib/logger';
import { countTokens } from '@/lib/utils/chunking';

export type ArticleQACachedResponse = CachedAIResponse;

/**
 * Article QA Cache
 *
 * Caches responses for article-specific Q&A sessions.
 * Invalidates cache when article is updated (via updatedAt timestamp).
 */
export class ArticleQACache extends RedisCache {
  private readonly maxTokensPerEntry = 10000; // CodexMCP recommendation

  constructor() {
    super({
      ttl: CACHE_TTL.SHORT, // 300s
      namespace: '@techtrend/cache:rag-qa',
    });
  }

  /**
   * Get cached response for an article query
   *
   * @param articleId - Article ID
   * @param query - User query
   * @param locale - User locale ('ja' or 'en')
   * @param updatedAt - Article last updated timestamp
   * @returns Cached response or null if not found/error
   */
  async getResponse(
    articleId: string,
    query: string,
    locale: 'ja' | 'en',
    updatedAt: Date
  ): Promise<ArticleQACachedResponse | null> {
    const key = this.generateQAKey(articleId, query, locale, updatedAt);
    const raw = await super.get<unknown>(key);
    if (raw === null) return null;
    // Backward compatibility: old entries stored as plain string
    if (typeof raw === 'string') {
      return { text: raw, toolCalls: [] };
    }
    if (
      typeof raw !== 'object' ||
      typeof (raw as { text?: unknown }).text !== 'string'
    ) {
      return null;
    }
    return {
      text: (raw as { text: string }).text,
      toolCalls: Array.isArray((raw as { toolCalls?: unknown }).toolCalls)
        ? (raw as { toolCalls: unknown[] }).toolCalls
        : [],
    };
  }

  /**
   * Cache article QA response
   *
   * Enforces token limit to prevent excessive cache growth.
   * Token limit is checked against text content only.
   *
   * @param articleId - Article ID
   * @param query - User query
   * @param locale - User locale ('ja' or 'en')
   * @param updatedAt - Article last updated timestamp
   * @param response - Agent response object with text and toolCalls
   */
  async setResponse(
    articleId: string,
    query: string,
    locale: 'ja' | 'en',
    updatedAt: Date,
    response: ArticleQACachedResponse
  ): Promise<void> {
    // Enforce token limit on text content only
    const tokenCount = countTokens(response.text);
    if (tokenCount > this.maxTokensPerEntry) {
      logger.warn(
        {
          articleId,
          queryHash: hashSensitiveValue(query),
          queryLength: query.length,
          tokenCount,
          maxTokens: this.maxTokensPerEntry,
        },
        'Article QA response exceeds token limit, skipping cache'
      );
      return;
    }

    const key = this.generateQAKey(articleId, query, locale, updatedAt);
    try {
      await super.set(key, response);
    } catch {
      // Graceful degradation - continue without error on write failure
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
  async invalidateResponse(
    articleId: string,
    query: string,
    locale: 'ja' | 'en',
    updatedAt: Date
  ): Promise<void> {
    const key = this.generateQAKey(articleId, query, locale, updatedAt);
    try {
      await super.delete(key);
    } catch {
      // Graceful degradation
    }
  }

  /**
   * Invalidate all cache entries for a specific article
   *
   * Useful when article content is updated.
   * Uses RedisCache's invalidatePattern with SCAN (non-blocking).
   *
   * @param articleId - Article ID
   */
  async invalidateArticle(articleId: string): Promise<void> {
    await this.invalidatePattern(`${articleId}:*`);
  }

  /**
   * Get cache key for an article query
   *
   * Key format (after namespace prefix): {articleId}:{normalizedQuery}:{locale}:{updatedAtMs}
   *
   * @param articleId - Article ID
   * @param query - User query
   * @param locale - User locale
   * @param updatedAt - Article last updated timestamp
   * @returns Cache key (without namespace prefix - added by RedisCache)
   */
  private generateQAKey(
    articleId: string,
    query: string,
    locale: 'ja' | 'en',
    updatedAt: Date
  ): string {
    const normalized = normalizeQuery(query, { preserveDot: true });
    const updatedAtMs = updatedAt.getTime();
    return `${articleId}:${normalized}:${locale}:${updatedAtMs}`;
  }
}
