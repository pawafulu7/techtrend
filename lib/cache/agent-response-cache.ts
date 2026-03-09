import { RedisCache } from './index';
import { CACHE_TTL, CACHE_RESPONSE_SIZE_LIMIT } from './constants';
import { CachedAIResponse } from './types';
import { normalizeQuery } from './normalize-query';
import { hashSensitiveValue, logger } from '@/lib/logger';

export type AgentCachedResponse = CachedAIResponse;

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
  async getResponse(query: string): Promise<AgentCachedResponse | null> {
    const key = normalizeQuery(query);
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
   * Cache agent response
   *
   * @param query - User query
   * @param response - Agent response object with text and toolCalls
   */
  async setResponse(
    query: string,
    response: AgentCachedResponse
  ): Promise<void> {
    try {
      const serialized = JSON.stringify(response);
      const responseSize = Buffer.byteLength(serialized, 'utf8');
      if (responseSize > CACHE_RESPONSE_SIZE_LIMIT.AGENT) {
        logger.warn(
          {
            queryHash: hashSensitiveValue(query),
            queryLength: query.length,
            responseSize,
            maxSize: CACHE_RESPONSE_SIZE_LIMIT.AGENT,
          },
          'Agent response exceeds size limit, skipping cache'
        );
        return;
      }
      // Use base class set() for stats tracking and consistent key generation
      // (response is re-serialized by super.set, but size check above prevents oversized entries)
      await super.set(normalizeQuery(query), response);
    } catch {
      // Graceful degradation - continue without error on serialize/write failure
    }
  }

  /**
   * Invalidate cache for a specific query
   *
   * @param query - User query
   */
  async invalidateResponse(query: string): Promise<void> {
    const key = normalizeQuery(query);
    try {
      await super.delete(key);
    } catch {
      // Graceful degradation - continue without error
    }
  }
}
