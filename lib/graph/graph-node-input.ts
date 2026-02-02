/**
 * Graph Node Input Types
 *
 * Type definitions for graph node serialization.
 * Separated from logic for cleaner module boundaries.
 *
 * @see lib/graph/graph-data-serializer.ts
 */

/**
 * Normalized input for GraphNode creation
 *
 * CodexMCP: Unified interface for Article and RelatedArticle
 */
export interface GraphNodeInput {
  id: string;
  title: string;
  translatedTitle?: string | null;
  tags?: Array<{ id?: string; name: string }>; // Phase 2: id optional
  url?: string;
  qualityScore?: number; // Phase 2: optional (default 0)
  publishedAt: Date | string;
  summary?: string;
  thumbnail?: string;
  sourceName?: string;
  similarity?: number;
  commonTags?: number;
  category?: string; // Phase 2: pre-computed category (avoid re-calculation)
}
