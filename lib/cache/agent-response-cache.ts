import { RedisCache } from './index';
import { CACHE_TTL } from './constants';

/**
 * Agent Response Cache
 *
 * Caches agent-generated responses for identical queries.
 * Short TTL (60s) to balance freshness and performance.
 *
 * Features:
 * - Query normalization (case-insensitive, whitespace, punctuation)
 * - Graceful degradation (inherited from RedisCache)
 * - Standardized namespace management and stats tracking
 *
 * @see CodexMCP Review: "Two-level caching strategy"
 * @see Plan: plan_20251019_141946_039_rag-agent-fuzzy-search.md:409-469
 */
export class AgentResponseCache extends RedisCache {
  constructor() {
    super({
      ttl: CACHE_TTL.VERY_SHORT, // 60s
      namespace: '@techtrend/cache:rag-agent',
    });
  }

  /**
   * Get cached response for a query
   *
   * @param query - User query
   * @returns Cached response or null if not found/error
   */
  async getResponse(query: string): Promise<string | null> {
    const key = this.generateAgentKey(query);
    return super.get<string>(key);
  }

  /**
   * Cache agent response
   *
   * @param query - User query
   * @param response - Agent response text
   */
  async setResponse(query: string, response: string): Promise<void> {
    const key = this.generateAgentKey(query);
    await super.set(key, response);
  }

  /**
   * Invalidate cache for a specific query
   *
   * @param query - User query
   */
  async invalidateResponse(query: string): Promise<void> {
    const key = this.generateAgentKey(query);
    try {
      await super.delete(key);
    } catch {
      // Graceful degradation - continue without error
    }
  }

  /**
   * Generate cache key with query normalization
   */
  private generateAgentKey(query: string): string {
    return this.normalizeQuery(query);
  }

  /**
   * Normalize query for cache key generation
   *
   * Normalization strategy:
   * - Lowercase (case-insensitive matching)
   * - Trim whitespace
   * - Collapse multiple spaces to single space
   * - Remove punctuation (!?。、；：etc. including .)
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
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/[!?。、；：！？、.]/g, ''); // Remove punctuation (including .)
  }
}
