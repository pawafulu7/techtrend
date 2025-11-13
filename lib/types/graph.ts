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

  // Phase 3: Depth information (0=center, 1=layer1, 2=layer2)
  // Only present when depth >= 2; ignored for depth=1
  depth?: number;
}

/**
 * Graph Link (Relationship)
 *
 * Represents a relationship between two articles.
 * Compatible with react-force-graph's link format.
 *
 * After force-graph hydration, source/target become node references.
 * At serialization (API response), they remain as string IDs.
 *
 * Phase 3 Hierarchical Levels:
 * - level 1: center→layer1 (direct relationships)
 * - level 2: layer1→layer2 (indirect relationships)
 */
export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;  // Similarity score (0-1), affects link width
  type: 'tag' | 'embedding';

  // CodexMCP: Additional fields for explaining edges
  commonTags?: number;
  overlapTags?: string[];
  scoreBreakdown?: {
    tag: number;
    embedding: number;
  };

  // Phase 3: Hierarchical level (1=center→layer1, 2=layer1→layer2)
  // Only present when depth >= 2; ignored for depth=1
  level?: number;

  // Phase 3: Parent node ID for layer-2 edges (which layer-1 node is the source)
  // Only present for level=2 edges; undefined for level=1 or depth=1
  parentId?: string;
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
    algorithm: 'tag' | 'embedding';
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
 *
 * Phase 3 Backwards Compatibility Contract:
 * When depth=1, the following layer-2 fields are ignored:
 * - GraphNode.depth, GraphLink.level, GraphLink.parentId
 * - GraphOptions.layer2Limit, GraphOptions.layer2PerParent
 *
 * The API will omit these fields from the response when depth=1.
 */
export interface GraphOptions {
  algorithm?: 'tag' | 'embedding';
  maxNodes?: number;
  minSimilarity?: number;
  depth?: number;

  // Phase 3: Layer-2 control parameters (only used when depth >= 2)
  layer2Limit?: number;       // Max total layer-2 nodes
  layer2PerParent?: number;   // Candidates per layer-1 node
}

/**
 * Graph Options Validation Schema
 *
 * Runtime validation using Zod.
 * Enforces safe ranges to prevent unbounded payloads and performance issues.
 *
 * CodexMCP recommendations:
 * - maxNodes: 1-150 (embedding-based small graphs supported, ~150 is manageable)
 * - minSimilarity: 0-1 (cosine similarity semantics)
 * - depth: 1-2 (keeps API fan-out predictable)
 */
export const graphOptionsSchema = z.object({
  algorithm: z
    .enum(['tag', 'embedding'])
    .default('tag')
    .describe('Relationship detection algorithm'),

  maxNodes: z
    .number()
    .int()
    .min(1, 'Minimum 1 node to allow smallest graphs')
    .max(150, 'Maximum 150 nodes for performance')
    .default(30)
    .describe('Maximum number of related articles to include'),

  minSimilarity: z
    .number()
    .min(0, 'Similarity must be between 0 and 1')
    .max(1, 'Similarity must be between 0 and 1')
    .default(0.2)
    .describe('Minimum similarity threshold for edges (Jaccard coefficient)'),

  depth: z
    .number()
    .int()
    .min(1, 'Minimum depth is 1')
    .max(2, 'Maximum depth is 2 to prevent combinatorial growth')
    .default(1)
    .describe(
      'Graph traversal depth (1 = direct relationships only, 2 = includes indirect relationships). ' +
        'When depth=1, layer-2 fields (node.depth, link.level, link.parentId, layer2Limit, layer2PerParent) are ignored.'
    ),

  // Phase 3: Layer-2 control parameters
  layer2Limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe(
      'Maximum total layer-2 nodes when depth=2. Ignored when depth=1. ' +
        'Defaults tuned for 8x4 fan-out; adjust if data skews.'
    ),

  layer2PerParent: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(4)
    .describe(
      'Candidate layer-2 nodes per layer-1 parent when depth=2. Ignored when depth=1. ' +
        'Total candidates = maxNodes × layer2PerParent, then top layer2Limit selected.'
    ),
}).superRefine((data, ctx) => {
  // CodexMCP: Warn when layer-2 parameters are provided with depth=1
  if (data.depth === 1 && (data.layer2Limit !== 10 || data.layer2PerParent !== 4)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'layer2Limit and layer2PerParent are ignored when depth=1. ' +
        'These parameters only apply when depth=2.',
      path: ['layer2Limit', 'layer2PerParent'],
    });
  }
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
};
