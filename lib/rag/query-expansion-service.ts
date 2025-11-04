/**
 * Query Expansion Service
 *
 * Expands search queries to improve semantic matching accuracy.
 *
 * Phase 2 Implementation: Dictionary-based expansion only
 * Phase 3 Future: Add AI-powered expansion for unknown abbreviations
 *
 * @see .claude/docs/plan/plan_20251105_002920_989_ai-search-query-expansion.md
 */

import { expandQueryWithDictionary } from './abbreviations';
import { logger } from '@/lib/logger';

/**
 * Query expansion result
 */
export interface QueryExpansionResult {
  originalQuery: string;
  expandedQuery: string;
  method: 'none' | 'dictionary' | 'ai';
  cacheHit: boolean;
  latencyMs: number;
}

/**
 * Query Expansion Service
 *
 * Phase 2: Dictionary-based expansion
 * Phase 3: Add AI fallback for unknown abbreviations
 */
export class QueryExpansionService {
  /**
   * Expand query using available methods
   *
   * Phase 2: Dictionary only
   * Phase 3: Dictionary + AI fallback
   *
   * @param query - Original query text
   * @returns Expansion result with metadata
   */
  async expandQuery(query: string): Promise<QueryExpansionResult> {
    const startTime = Date.now();
    const trimmed = query.trim();

    // Try static dictionary (fast path)
    const dictExpanded = expandQueryWithDictionary(trimmed);

    if (dictExpanded !== trimmed) {
      const latencyMs = Date.now() - startTime;

      logger.info({
        originalQuery: trimmed,
        expandedQuery: dictExpanded,
        method: 'dictionary',
        latencyMs,
      }, 'Query expanded via dictionary');

      return {
        originalQuery: trimmed,
        expandedQuery: dictExpanded,
        method: 'dictionary',
        cacheHit: false,
        latencyMs,
      };
    }

    // Phase 2: No expansion (AI expansion will be added in Phase 3)
    return {
      originalQuery: trimmed,
      expandedQuery: trimmed,
      method: 'none',
      cacheHit: false,
      latencyMs: Date.now() - startTime,
    };
  }
}
