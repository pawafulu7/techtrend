import type { GraphNode, GraphLink, GraphData } from '@/lib/types/graph';
import type { Article } from '@/lib/prisma-exports';
import { logger } from '@/lib/logger';
import type { SearchResult } from '@/lib/rag/vector-search-service';
import type { GraphNodeInput } from './graph-node-input';
import { getCategory } from './graph-utils';
import {
  toGraphNodeInput,
  toGraphNode,
  countCommonTags,
} from './node-transformer';
import {
  findArticleSimilarity,
  findArticleCommonTags,
  countCategories,
} from './link-builder';
import { selectTopLayer2 as selectTopLayer2Impl } from './graph-selection';
import { serializeWithDepthImpl } from './depth-serializer';

/**
 * Graph Data Serializer
 *
 * Converts article relationship data to GraphData format.
 * Server-side transformation for security and performance.
 *
 * Related modules:
 * - ./graph-node-input.ts: Type definitions
 * - ./graph-utils.ts: Constants and pure utility functions
 * - ./node-transformer.ts: Node conversion logic
 * - ./link-builder.ts: Link construction and category counting
 * - ./graph-selection.ts: Layer-2 selection algorithm
 * - ./depth-serializer.ts: Depth-based serialization (Phase 3)
 *
 * CodexMCP recommendations:
 * - Normalize Article/RelatedArticle via toGraphNodeInput()
 * - Use lookup table for category detection (not regex everywhere)
 * - Resilient error handling (best-effort graphs)
 * - Log missing data, fallback to defaults
 *
 * @example
 * ```typescript
 * // Tag-based serialization
 * const result = GraphDataSerializer.serializeTagBased(centerArticle, relatedArticles);
 *
 * // Embedding-based serialization
 * const result = GraphDataSerializer.serializeEmbeddingBased(centerArticle, searchResults);
 *
 * // Depth-based serialization (with Layer 2)
 * const result = GraphDataSerializer.serializeWithDepth(centerArticle, layer1, layer2, options);
 * ```
 *
 * @see Plan: .claude/docs/plan/plan_20251111_233131_021_article-relationship-graph.md
 */

export class GraphDataSerializer {
  /**
   * Serialize tag-based relationships to GraphData
   *
   * @param centerArticle - The center article (full Article object)
   * @param relatedArticles - Related articles (lightweight objects)
   * @returns GraphData with nodes and links
   */
  static serializeTagBased(
    centerArticle: Article & { tags: Array<{ id: string; name: string }> },
    relatedArticles: GraphNodeInput[]
  ): GraphData {
    try {
      // Normalize center article
      const centerNode = toGraphNode(
        toGraphNodeInput(centerArticle),
        true // isCenter
      );

      // Normalize related articles
      const relatedNodes = relatedArticles
        .map((article) => {
          try {
            return toGraphNode(article, false);
          } catch (error) {
            // CodexMCP: Best-effort, skip invalid nodes
            logger.warn(
              {
                articleId: article.id,
                error: error instanceof Error ? error.message : String(error),
              },
              'Skipping invalid node in graph serialization'
            );
            return null;
          }
        })
        .filter((node): node is GraphNode => node !== null);

      // Generate links (center -> related)
      const links: GraphLink[] = relatedNodes.map((node) => ({
        source: centerNode.id,
        target: node.id,
        value: findArticleSimilarity(relatedArticles, node.id) || 0,
        type: 'tag',
        commonTags: findArticleCommonTags(relatedArticles, node.id),
      }));

      // Calculate result stats (CodexMCP: guard against empty arrays)
      const similarities = links.map((l) => l.value);
      const categoryCounts = countCategories([centerNode, ...relatedNodes]);

      const graphData: GraphData = {
        nodes: [centerNode, ...relatedNodes],
        links,
        metadata: {
          centerArticleId: centerNode.id,
          algorithm: 'tag',
          nodeCount: relatedNodes.length + 1,
          linkCount: links.length,
          timestamp: new Date().toISOString(),
          options: {
            algorithm: 'tag',
            maxNodes: relatedArticles.length,
            minSimilarity:
              similarities.length > 0 ? Math.min(...similarities) : 0,
          },
          resultStats: {
            maxSimilarity:
              similarities.length > 0 ? Math.max(...similarities) : 0,
            minSimilarity:
              similarities.length > 0 ? Math.min(...similarities) : 0,
            avgSimilarity:
              similarities.length > 0
                ? similarities.reduce((sum, val) => sum + val, 0) /
                  similarities.length
                : 0,
            categoryCounts,
          },
        },
      };

      logger.info(
        {
          centerArticleId: centerNode.id,
          nodeCount: graphData.nodes.length,
          linkCount: graphData.links.length,
          algorithm: 'tag',
        },
        'Graph data serialized (tag-based)'
      );

      return graphData;
    } catch (error) {
      logger.error(
        {
          centerArticleId: centerArticle.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to serialize graph data'
      );

      throw error;
    }
  }

  /**
   * Serialize embedding-based graph data (Phase 2)
   *
   * Converts embedding search results to GraphData format
   *
   * @param centerArticle - Center article
   * @param embeddingResults - Similar articles from VectorSearchService
   * @returns GraphData for visualization
   */
  static serializeEmbeddingBased(
    centerArticle: Article & { tags: Array<{ id: string; name: string }> },
    embeddingResults: Array<{
      articleId: string;
      title: string;
      translatedTitle?: string | null;
      summary: string | null;
      publishedAt: Date;
      qualityScore?: number;
      sourceName?: string;
      tags?: Array<{ id: string; name: string }>;
      thumbnail?: string | null;
      similarity: number;
    }>
  ): GraphData {
    try {
      // Convert SearchResult to GraphNodeInput
      const centerTags = centerArticle.tags.map((t) => t.name);

      const relatedInputs: GraphNodeInput[] = embeddingResults.map((result) => {
        const resultTags = result.tags?.map((t) => t.name) || [];

        return {
          id: result.articleId,
          title: result.title,
          translatedTitle: result.translatedTitle ?? null,
          tags: result.tags || [],
          url: `/articles/${result.articleId}`,
          qualityScore: result.qualityScore ?? 0,
          publishedAt: result.publishedAt,
          summary: result.summary || '',
          thumbnail: result.thumbnail || undefined,
          sourceName: result.sourceName,
          similarity: result.similarity,
          commonTags: countCommonTags(centerTags, resultTags),
          category: getCategory(result.tags || []), // Pre-compute
        };
      });

      // Normalize center article
      const centerNode = toGraphNode(
        toGraphNodeInput(centerArticle),
        true // isCenter
      );

      // Normalize related articles
      const relatedNodes = relatedInputs
        .map((input) => {
          try {
            return toGraphNode(input, false);
          } catch (error) {
            // CodexMCP: Best-effort, skip invalid nodes
            logger.warn(
              {
                articleId: input.id,
                error: error instanceof Error ? error.message : String(error),
              },
              'Skipping invalid node in graph serialization'
            );
            return null;
          }
        })
        .filter((node): node is GraphNode => node !== null);

      // Generate links (center -> related)
      const links: GraphLink[] = relatedInputs
        .filter((input) => relatedNodes.some((node) => node.id === input.id))
        .map((input) => ({
          source: centerNode.id,
          target: input.id,
          value: input.similarity || 0,
          type: 'embedding',
          commonTags: input.commonTags,
        }));

      // Calculate result stats (CodexMCP: guard against empty arrays)
      const similarities = links.map((l) => l.value);
      const categoryCounts = countCategories([centerNode, ...relatedNodes]);

      const graphData: GraphData = {
        nodes: [centerNode, ...relatedNodes],
        links,
        metadata: {
          centerArticleId: centerNode.id,
          algorithm: 'embedding',
          nodeCount: relatedNodes.length + 1,
          linkCount: links.length,
          timestamp: new Date().toISOString(),
          options: {
            algorithm: 'embedding',
            maxNodes: embeddingResults.length,
            minSimilarity:
              similarities.length > 0 ? Math.min(...similarities) : 0,
            depth: 1,
          },
          resultStats: {
            maxSimilarity:
              similarities.length > 0 ? Math.max(...similarities) : 0,
            minSimilarity:
              similarities.length > 0 ? Math.min(...similarities) : 0,
            avgSimilarity:
              similarities.length > 0
                ? similarities.reduce((sum, val) => sum + val, 0) /
                  similarities.length
                : 0,
            categoryCounts,
          },
        },
      };

      logger.info(
        {
          centerArticleId: centerNode.id,
          nodeCount: graphData.nodes.length,
          linkCount: graphData.links.length,
          algorithm: 'embedding',
        },
        'Graph data serialized (embedding-based)'
      );

      return graphData;
    } catch (error) {
      logger.error(
        {
          centerArticleId: centerArticle.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to serialize graph data (embedding)'
      );

      throw error;
    }
  }

  /**
   * Serialize graph data with depth metadata (Phase 3)
   *
   * @see ./depth-serializer.ts for implementation
   */
  static serializeWithDepth(
    centerArticle: Article & { tags: Array<{ id: string; name: string }> },
    layer1: Array<SearchResult>,
    layer2: Array<SearchResult & { parentId: string }>,
    algorithm: 'tag' | 'embedding'
  ): GraphData {
    return serializeWithDepthImpl(centerArticle, layer1, layer2, algorithm);
  }

  /**
   * Select top layer-2 nodes with priority ranking (Phase 3)
   */
  static selectTopLayer2(
    candidates: Array<SearchResult & { parentId: string }>,
    layer1: SearchResult[],
    centerArticle: Article,
    limit: number
  ): Array<SearchResult & { parentId: string }> {
    return selectTopLayer2Impl(candidates, layer1, centerArticle, limit);
  }
}

// Re-export for backwards compatibility
export type { GraphNodeInput } from './graph-node-input';
export { GRAPH_CONSTANTS, CATEGORY_RULES } from './graph-utils';
