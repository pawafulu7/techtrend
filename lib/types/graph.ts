import { z } from 'zod';

/**
 * Graph Visualization Types
 *
 * Type definitions for article relationship graph visualization.
 * Compatible with react-force-graph library.
 *
 * @see react-force-graph: /vasturiano/react-force-graph
 * @see Plan: .claude/docs/plan/plan_20251111_233131_021_article-relationship-graph.md
 */

/**
 * Graph Node (Article)
 *
 * Represents an article in the relationship graph.
 * Compatible with react-force-graph's node format.
 */
export interface GraphNode {
  id: string;
  label: string;
  val: number;  // Node size (quality score 0-100)
  color: string;
  category: string;
  publishedAt: string;  // ISO 8601 format
  url: string;

  // CodexMCP: Additional fields for tooltips/cards
  summary?: string;
  thumbnail?: string;
  sourceName?: string;
  primaryTag?: string;
}

/**
 * Graph Link (Relationship)
 *
 * Represents a relationship between two articles.
 * Compatible with react-force-graph's link format.
 *
 * After force-graph hydration, source/target become node references.
 * At serialization (API response), they remain as string IDs.
 */
export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;  // Similarity score (0-1), affects link width
  type: 'tag' | 'embedding' | 'hybrid';

  // CodexMCP: Additional fields for explaining edges
  commonTags?: number;
  overlapTags?: string[];
  scoreBreakdown?: {
    tag: number;
    embedding: number;
  };
}

/**
 * Graph Data
 *
 * Complete graph data structure with nodes, links, and metadata.
 */
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  metadata: {
    centerArticleId: string;
    algorithm: 'tag' | 'embedding' | 'hybrid';
    nodeCount: number;
    linkCount: number;
    timestamp: string;  // ISO 8601 format

    // CodexMCP: Include resolved options and result stats
    options: GraphOptions;
    resultStats?: {
      maxSimilarity: number;
      minSimilarity: number;
      avgSimilarity: number;
      categoryCounts: Record<string, number>;
    };
  };
}

/**
 * Graph Options (Query Parameters)
 *
 * Configuration options for graph generation.
 */
export interface GraphOptions {
  algorithm?: 'tag' | 'embedding' | 'hybrid';
  maxNodes?: number;
  minSimilarity?: number;
  depth?: number;
}

/**
 * Graph Options Validation Schema
 *
 * Runtime validation using Zod.
 * Enforces safe ranges to prevent unbounded payloads and performance issues.
 *
 * CodexMCP recommendations:
 * - maxNodes: 5-150 (below 5 is sparse, ~150 is manageable for ForceGraph2D/3D)
 * - minSimilarity: 0-1 (cosine similarity semantics)
 * - depth: 1-2 (keeps API fan-out predictable)
 */
export const graphOptionsSchema = z.object({
  algorithm: z
    .enum(['tag', 'embedding', 'hybrid'])
    .default('tag')
    .describe('Relationship detection algorithm'),

  maxNodes: z
    .number()
    .int()
    .min(5, 'Minimum 5 nodes for meaningful graph')
    .max(150, 'Maximum 150 nodes for performance')
    .default(20)
    .describe('Maximum number of related articles to include'),

  minSimilarity: z
    .number()
    .min(0, 'Similarity must be between 0 and 1')
    .max(1, 'Similarity must be between 0 and 1')
    .default(0.3)
    .describe('Minimum similarity threshold for edges'),

  depth: z
    .number()
    .int()
    .min(1, 'Minimum depth is 1')
    .max(2, 'Maximum depth is 2 to prevent combinatorial growth')
    .default(1)
    .describe('Graph traversal depth (1 = direct relationships only)'),
});

/**
 * Inferred TypeScript type from Zod schema
 *
 * CodexMCP: Mirror existing pattern (e.g. lib/types/article-link.ts)
 */
export type GraphOptionsValidated = z.infer<typeof graphOptionsSchema>;

/**
 * Category to Color Mapping
 *
 * Visual encoding for article categories.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  Frontend: '#4F46E5',      // Indigo
  Backend: '#10B981',       // Green
  'AI/ML': '#F59E0B',       // Amber
  DevOps: '#8B5CF6',        // Purple
  Database: '#06B6D4',      // Cyan
  Security: '#EF4444',      // Red
  Testing: '#EC4899',       // Pink
  Other: '#6B7280',         // Gray
};

/**
 * Link Type to Color Mapping
 *
 * Visual encoding for relationship types.
 */
export const LINK_TYPE_COLORS: Record<string, string> = {
  tag: 'rgba(148, 163, 184, 0.5)',       // Slate (semi-transparent)
  embedding: 'rgba(59, 130, 246, 0.5)',  // Blue (semi-transparent)
  hybrid: 'rgba(168, 85, 247, 0.5)',     // Purple (semi-transparent)
};
