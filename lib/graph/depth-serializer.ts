import type { GraphNode, GraphLink, GraphData } from '@/lib/types/graph';
import type { Article } from '@prisma/client';
import { logger } from '@/lib/logger';
import type { SearchResult } from '@/lib/rag/vector-search-service';
import type { GraphNodeInput } from './graph-node-input';
import { getCategory } from './graph-utils';
import {
  toGraphNodeInput,
  toGraphNode,
  countCommonTags,
} from './node-transformer';
import { countCategories, deriveLayer2Options } from './link-builder';

/**
 * Depth-based graph serialization (Phase 3)
 *
 * Extracted from GraphDataSerializer.serializeWithDepth for file size management.
 * Handles Layer 1 + Layer 2 node/link construction with depth metadata.
 *
 * @see GraphDataSerializer for public API
 */
export function serializeWithDepthImpl(
  centerArticle: Article & { tags: Array<{ id: string; name: string }> },
  layer1: Array<SearchResult>,
  layer2: Array<SearchResult & { parentId: string }>,
  algorithm: 'tag' | 'embedding'
): GraphData {
  try {
    const hasLayer2 = layer2.length > 0;
    const depth = hasLayer2 ? 2 : 1;
    const includeDepthMetadata = depth > 1;

    const centerTags = centerArticle.tags.map((tag) => tag.name);

    const toGraphNodeInputFromSearchResult = (
      result: SearchResult
    ): GraphNodeInput => {
      const tags = result.tags || [];
      const tagNames = tags.map((tag) => tag.name);

      return {
        id: result.articleId,
        title: result.title,
        translatedTitle: result.translatedTitle ?? null,
        tags,
        url: `/articles/${result.articleId}`,
        qualityScore: result.qualityScore ?? 0,
        publishedAt: result.publishedAt,
        summary: result.summary || '',
        thumbnail: result.thumbnail || undefined,
        sourceName: result.sourceName,
        similarity: result.similarity,
        commonTags: countCommonTags(centerTags, tagNames),
        category: getCategory(tags),
      };
    };

    const layer1Inputs = layer1.map(toGraphNodeInputFromSearchResult);

    const parentTagNameMap = new Map<string, string[]>();
    layer1.forEach((parent) => {
      parentTagNameMap.set(
        parent.articleId,
        parent.tags?.map((tag) => tag.name) || []
      );
    });

    const layer2Inputs = layer2.map((candidate) => {
      const tags = candidate.tags || [];
      const tagNames = tags.map((tag) => tag.name);

      return {
        candidate,
        input: {
          id: candidate.articleId,
          title: candidate.title,
          translatedTitle: candidate.translatedTitle ?? null,
          tags,
          url: `/articles/${candidate.articleId}`,
          qualityScore: candidate.qualityScore ?? 0,
          publishedAt: candidate.publishedAt,
          summary: candidate.summary || '',
          thumbnail: candidate.thumbnail || undefined,
          sourceName: candidate.sourceName,
          similarity: candidate.similarity,
          commonTags: countCommonTags(centerTags, tagNames),
          category: getCategory(tags),
        },
        tagNames,
      };
    });

    const centerNode = toGraphNode(toGraphNodeInput(centerArticle), true);

    if (includeDepthMetadata) {
      centerNode.depth = 0;
    }

    const layer1Nodes = layer1Inputs
      .map((input) => {
        try {
          const node = toGraphNode(input, false);
          if (includeDepthMetadata) {
            node.depth = 1;
          }
          return node;
        } catch (error) {
          logger.warn(
            {
              articleId: input.id,
              error: error instanceof Error ? error.message : String(error),
            },
            'Skipping invalid layer-1 node in depth serialization'
          );
          return null;
        }
      })
      .filter((node): node is GraphNode => node !== null);

    const layer2Nodes = hasLayer2
      ? layer2Inputs
          .map(({ input }) => {
            try {
              const node = toGraphNode(input, false);
              if (includeDepthMetadata) {
                node.depth = 2;
              }
              return node;
            } catch (error) {
              logger.warn(
                {
                  articleId: input.id,
                  error: error instanceof Error ? error.message : String(error),
                },
                'Skipping invalid layer-2 node in depth serialization'
              );
              return null;
            }
          })
          .filter((node): node is GraphNode => node !== null)
      : [];

    const layer1NodeIds = new Set(layer1Nodes.map((node) => node.id));
    const layer2NodeIds = new Set(layer2Nodes.map((node) => node.id));

    const layer1Links: GraphLink[] = layer1Inputs
      .filter((input) => layer1NodeIds.has(input.id))
      .map((input) => {
        const link: GraphLink = {
          source: centerNode.id,
          target: input.id,
          value: input.similarity || 0,
          type: algorithm,
          commonTags: input.commonTags,
        };

        if (includeDepthMetadata) {
          link.level = 1;
        }

        return link;
      });

    const layer2Links: GraphLink[] = hasLayer2
      ? layer2Inputs
          .filter(
            ({ input, candidate }) =>
              layer2NodeIds.has(input.id) &&
              layer1NodeIds.has(candidate.parentId)
          )
          .map(({ input, candidate, tagNames }) => {
            const link: GraphLink = {
              source: candidate.parentId,
              target: input.id,
              value: input.similarity || 0,
              type: algorithm,
              commonTags: countCommonTags(
                parentTagNameMap.get(candidate.parentId) || [],
                tagNames
              ),
            };

            if (includeDepthMetadata) {
              link.level = 2;
              link.parentId = candidate.parentId;
            }

            return link;
          })
      : [];

    const links = [...layer1Links, ...layer2Links];
    const nodes = [centerNode, ...layer1Nodes, ...layer2Nodes];

    const similarities = links.map((link) => link.value);
    const categoryCounts = countCategories(nodes);

    const { limit: derivedLayer2Limit, perParent: derivedLayer2PerParent } =
      deriveLayer2Options(layer2);

    const metadataOptions: GraphData['metadata']['options'] = {
      algorithm,
      maxNodes: layer1.length + layer2.length,
      minSimilarity: similarities.length > 0 ? Math.min(...similarities) : 0,
      depth,
    };

    if (includeDepthMetadata) {
      metadataOptions.layer2Limit = derivedLayer2Limit;
      metadataOptions.layer2PerParent = derivedLayer2PerParent;
    }

    const graphData: GraphData = {
      nodes,
      links,
      metadata: {
        centerArticleId: centerNode.id,
        algorithm,
        nodeCount: nodes.length,
        linkCount: links.length,
        timestamp: new Date().toISOString(),
        options: metadataOptions,
        resultStats: {
          maxSimilarity:
            similarities.length > 0 ? Math.max(...similarities) : 0,
          minSimilarity:
            similarities.length > 0 ? Math.min(...similarities) : 0,
          avgSimilarity:
            similarities.length > 0
              ? similarities.reduce((sum, value) => sum + value, 0) /
                similarities.length
              : 0,
          categoryCounts,
        },
      },
    };

    logger.info(
      {
        centerArticleId: centerNode.id,
        layer1Count: layer1Nodes.length,
        layer2Count: layer2Nodes.length,
        depth,
        algorithm,
      },
      'Graph data serialized with depth support (Phase 3)'
    );

    return graphData;
  } catch (error) {
    logger.error(
      {
        centerArticleId: centerArticle.id,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to serialize graph data with depth (Phase 3)'
    );

    throw error;
  }
}
