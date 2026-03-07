import type { GraphNode } from '@/lib/types/graph';
import type { SearchResult } from '@/lib/rag/vector-search-service';
import type { GraphNodeInput } from './graph-node-input';
import { clamp01 } from './graph-utils';

/**
 * Find article similarity from related articles array
 */
export function findArticleSimilarity(
  relatedArticles: GraphNodeInput[],
  articleId: string
): number | undefined {
  return relatedArticles.find((a) => a.id === articleId)?.similarity;
}

/**
 * Find article common tags count
 */
export function findArticleCommonTags(
  relatedArticles: GraphNodeInput[],
  articleId: string
): number | undefined {
  return relatedArticles.find((a) => a.id === articleId)?.commonTags;
}

/**
 * Count articles per category
 */
export function countCategories(nodes: GraphNode[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const node of nodes) {
    counts[node.category] = (counts[node.category] || 0) + 1;
  }

  return counts;
}

/**
 * Estimate similarity between a layer-2 candidate and the center article
 */
export function resolveCenterSimilarity(
  candidate: SearchResult & { parentId: string },
  parentSimilarityMap: Map<string, number>
): number {
  const candidateWithCenter = candidate as SearchResult & {
    centerSimilarity?: number;
  };
  if (typeof candidateWithCenter.centerSimilarity === 'number') {
    return clamp01(candidateWithCenter.centerSimilarity);
  }

  const parentSimilarity = parentSimilarityMap.get(candidate.parentId);
  const parentToCenter =
    parentSimilarity !== undefined ? clamp01(parentSimilarity) : undefined;
  const candidateToParent = clamp01(candidate.similarity);

  if (parentToCenter === undefined) {
    return candidateToParent;
  }

  const estimated = Math.sqrt(parentToCenter * candidateToParent);
  return clamp01(estimated);
}

/**
 * Derive layer-2 option metadata from the delivered payload
 */
export function deriveLayer2Options(
  layer2: Array<SearchResult & { parentId: string }>
): { limit?: number; perParent?: number } {
  if (!Array.isArray(layer2) || layer2.length === 0) {
    return {};
  }

  const parentCounts = layer2.reduce<Record<string, number>>(
    (acc, candidate) => {
      if (!candidate.parentId) {
        return acc;
      }
      acc[candidate.parentId] = (acc[candidate.parentId] || 0) + 1;
      return acc;
    },
    {}
  );

  const counts = Object.values(parentCounts);

  return {
    limit: layer2.length,
    perParent: counts.length > 0 ? Math.max(...counts) : undefined,
  };
}
