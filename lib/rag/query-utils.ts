/**
 * Query utility functions for RAG operations
 *
 * Provides helper functions for query analysis and optimization.
 */

/**
 * Calculate optimal similarity threshold based on query characteristics
 *
 * Strategy:
 * - Token count takes priority over character length for threshold selection
 * - Shorter queries need lower thresholds to improve recall
 * - Longer queries can use higher thresholds for better precision
 *
 * Rationale:
 * - Short queries (e.g., "CTO") have limited semantic context
 * - Vector embeddings for short queries produce lower similarity scores
 * - Investigation showed "CTO" query had similarity 0.5178 (would be filtered at 0.7)
 *
 * @param query - Search query text
 * @returns Recommended threshold (0.5-0.65 range)
 *
 * @example
 * getDynamicThreshold("CTO")                       // 0.5 (very short)
 * getDynamicThreshold("React")                     // 0.55 (short)
 * getDynamicThreshold("React hooks")               // 0.6 (medium)
 * getDynamicThreshold("React hooks best practices") // 0.65 (long)
 *
 * @see .claude/docs/investigate/investigate_20251105_002137_264_ai-search-accuracy.md
 * @see .claude/docs/plan/plan_20251105_002920_989_ai-search-query-expansion.md
 */
export function getDynamicThreshold(query: string): number {
  const trimmed = query.trim();

  // Handle empty query edge case
  if (!trimmed) {
    return 0.5; // Default to most lenient threshold
  }

  const tokenCount = trimmed.split(/\s+/).length;
  const charLength = trimmed.length;

  // Priority 1: Token count (semantic granularity)
  // Single token queries need lower threshold
  if (tokenCount === 1) {
    // Further refine by character length
    if (charLength <= 3) {
      return 0.5;  // Very short: "CTO", "AI", "SRE"
    } else if (charLength <= 10) {
      return 0.55; // Short: "React", "TypeScript"
    } else {
      return 0.6;  // Medium single token: "Authentication"
    }
  }

  // Priority 2: Multi-token queries
  if (tokenCount === 2) {
    return 0.6;  // "React hooks", "API design"
  }

  if (tokenCount <= 4) {
    return 0.6;  // "React hooks tutorial", "Next.js image optimization"
  }

  // Long queries: Higher threshold for precision
  return 0.65;   // "How to optimize React application performance"
}
