import type { Article } from '@prisma/client';
import { logger } from '@/lib/logger';
import type { SearchResult } from '@/lib/rag/vector-search-service';
import { GRAPH_CONSTANTS, clamp01, normalizeQualityScore } from './graph-utils';
import { resolveCenterSimilarity } from './link-builder';

/**
 * Select top layer-2 nodes with priority ranking (Phase 3)
 */
export function selectTopLayer2(
  candidates: Array<SearchResult & { parentId: string }>,
  layer1: SearchResult[],
  centerArticle: Article,
  limit: number
): Array<SearchResult & { parentId: string }> {
  try {
    if (!Array.isArray(candidates) || candidates.length === 0 || limit <= 0) {
      return [];
    }

    const exclusionSet = new Set<string>([
      centerArticle.id,
      ...layer1.map((article) => article.articleId),
    ]);

    const dedupedMap = new Map<string, SearchResult & { parentId: string }>();
    for (const candidate of candidates) {
      if (!candidate?.articleId || !candidate.parentId) {
        logger.warn(
          { candidateId: candidate?.articleId },
          'Invalid layer-2 candidate'
        );
        continue;
      }

      if (exclusionSet.has(candidate.articleId)) {
        continue;
      }

      const existing = dedupedMap.get(candidate.articleId);
      if (
        !existing ||
        (candidate.similarity ?? 0) > (existing.similarity ?? 0)
      ) {
        dedupedMap.set(candidate.articleId, candidate);
      }
    }

    const uniqueCandidates = Array.from(dedupedMap.values());
    if (uniqueCandidates.length === 0) {
      return [];
    }

    const parentGroups = new Map<
      string,
      Array<SearchResult & { parentId: string }>
    >();
    for (const candidate of uniqueCandidates) {
      const group = parentGroups.get(candidate.parentId) || [];
      group.push(candidate);
      parentGroups.set(candidate.parentId, group);
    }

    const parentCount = parentGroups.size;
    if (parentCount === 0) {
      logger.warn('No valid parents found for layer-2 candidates');
      return [];
    }

    if (parentCount < 4) {
      logger.warn(
        { parentCount, limit },
        'Layer-2 parents below diversity threshold'
      );
    }

    const perParentCap = Math.max(1, Math.ceil(limit / parentCount));

    const parentSimilarityMap = new Map<string, number>(
      layer1.map((article) => [article.articleId, article.similarity])
    );

    const qualitySamples = [
      centerArticle.qualityScore,
      ...layer1.map((article) => article.qualityScore),
      ...uniqueCandidates.map((candidate) => candidate.qualityScore),
    ].filter(
      (score): score is number =>
        typeof score === 'number' && !Number.isNaN(score)
    );

    const avgQuality =
      qualitySamples.length > 0
        ? qualitySamples.reduce((sum, value) => sum + value, 0) /
          qualitySamples.length
        : GRAPH_CONSTANTS.MIN_QUALITY_SCORE;

    type RankedCandidate = {
      candidate: SearchResult & { parentId: string };
      normalizedParentSimilarity: number;
      centerSimilarity: number;
      globalPriority: number;
      publishedAtMs: number;
    };

    const rankedCandidates: RankedCandidate[] = [];

    parentGroups.forEach((group) => {
      const similarities = group.map((item) => clamp01(item.similarity));
      const maxSimilarity = Math.max(...similarities);
      const minSimilarity = Math.min(...similarities);
      const denom = maxSimilarity - minSimilarity;

      group.forEach((candidate, index) => {
        const normalizedParentSimilarity =
          denom === 0
            ? 1
            : (similarities[index] - minSimilarity) / (denom || 1);

        const centerSimilarity = resolveCenterSimilarity(
          candidate,
          parentSimilarityMap
        );
        const resolvedQuality =
          typeof candidate.qualityScore === 'number'
            ? candidate.qualityScore
            : avgQuality;
        const normalizedQuality = normalizeQualityScore(resolvedQuality);
        const globalPriority = 0.7 * centerSimilarity + 0.3 * normalizedQuality;

        rankedCandidates.push({
          candidate,
          normalizedParentSimilarity,
          centerSimilarity,
          globalPriority,
          publishedAtMs:
            candidate.publishedAt instanceof Date
              ? candidate.publishedAt.getTime()
              : new Date(candidate.publishedAt).getTime(),
        });
      });
    });

    rankedCandidates.sort((a, b) => {
      if (b.normalizedParentSimilarity !== a.normalizedParentSimilarity) {
        return b.normalizedParentSimilarity - a.normalizedParentSimilarity;
      }
      if (b.globalPriority !== a.globalPriority) {
        return b.globalPriority - a.globalPriority;
      }
      return b.publishedAtMs - a.publishedAtMs;
    });

    const perParentUsage = new Map<string, number>();
    const selected: Array<SearchResult & { parentId: string }> = [];

    for (const entry of rankedCandidates) {
      if (selected.length >= limit) {
        break;
      }

      const usedByParent = perParentUsage.get(entry.candidate.parentId) || 0;
      if (usedByParent >= perParentCap) {
        continue;
      }

      perParentUsage.set(entry.candidate.parentId, usedByParent + 1);
      selected.push(entry.candidate);
    }

    logger.info(
      {
        requestedLimit: limit,
        selectedCount: selected.length,
        parentCount,
        perParentCap,
      },
      'Layer-2 selection completed with global priority'
    );

    return selected;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to select top layer-2 candidates'
    );
    return [];
  }
}
