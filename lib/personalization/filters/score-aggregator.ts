/**
 * Score Aggregator - Layer 2 & 3: Score Calculation, Sorting, and Aggregation
 *
 * Pure functions for recency decay, final score calculation, weighted centroid,
 * and sorting logic.
 */

import { logger } from '@/lib/logger';
import type {
  ScoreParameters,
  ScoredArticle,
  PersonalizedSortBy,
} from '../types';
import { DEFAULT_SCORE_PARAMETERS } from '../types';
import type {
  EmbeddingCandidate,
  CandidateWithTagMatch,
} from './candidate-extractor';

export type ScoredArticleWithMeta = ScoredArticle &
  Pick<
    EmbeddingCandidate,
    'publishedAt' | 'createdAt' | 'qualityScore' | 'bookmarks' | 'userVotes'
  >;

// =============================================================================
// Pure Functions for Score Calculation
// =============================================================================

/**
 * Calculate recency decay using exponential decay function.
 * Formula: exp(-ln(2) * age_days / half_life_days)
 *
 * @param publishedAt - Article publication date
 * @param halfLifeDays - Days for decay to reach 0.5 (default: 365)
 * @returns Decay factor between 0 and 1
 */
export function calculateRecencyDecay(
  publishedAt: Date,
  halfLifeDays: number = DEFAULT_SCORE_PARAMETERS.halfLifeDays
): number {
  const ageDays = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 1.0;
  return Math.exp((-Math.LN2 * ageDays) / halfLifeDays);
}

/**
 * Calculate final score from components.
 * Formula: sim_emb + alpha * tag_match + beta * recency_decay
 *
 * @param embeddingSimilarity - Cosine similarity to category centroid (0-1)
 * @param hasTagMatch - Whether article has matching category tag
 * @param recencyDecay - Recency decay factor (0-1)
 * @param params - Score parameters (alpha, beta)
 * @returns Final score
 */
export function calculateFinalScore(
  embeddingSimilarity: number,
  hasTagMatch: boolean,
  recencyDecay: number,
  params: ScoreParameters = DEFAULT_SCORE_PARAMETERS
): number {
  const tagBoost = hasTagMatch ? 1 : 0;
  return (
    embeddingSimilarity +
    params.tagBoostAlpha * tagBoost +
    params.recencyBeta * recencyDecay
  );
}

/**
 * Compute weighted average of multiple centroids.
 * Uses L2 normalization after averaging.
 *
 * NOTE: This function is kept for backward compatibility and testing,
 * but is no longer used for multi-category filtering (replaced by OR search
 * in filterArticlesMultiCategory). Will be used when AND-mode toggle is
 * implemented (Phase 5b).
 *
 * @param centroids - Array of centroid vectors (as strings from DB)
 * @param weights - Optional weights for each centroid (default: equal)
 * @returns Averaged and normalized centroid as string
 */
export function computeWeightedCentroid(
  centroids: string[],
  weights?: number[]
): string {
  if (centroids.length === 0) {
    throw new Error('No centroids provided');
  }

  if (centroids.length === 1) {
    return centroids[0];
  }

  // Parse centroid strings to number arrays
  const vectors = centroids.map((c) => {
    const parsed = c
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((s) => {
        const n = Number(s);
        const isInvalid = isNaN(n);
        if (isInvalid) {
          logger.debug(
            { token: s },
            'NaN detected in centroid string, replacing with 0'
          );
        }
        return isInvalid ? 0 : n;
      });
    return parsed;
  });

  // Validate dimensions
  const dim = vectors[0].length;
  if (!vectors.every((v) => v.length === dim)) {
    throw new Error('Centroid dimensions do not match');
  }

  // Compute weighted average
  const effectiveWeights = weights ?? vectors.map(() => 1 / vectors.length);
  const weightSum = effectiveWeights.reduce((a, b) => a + b, 0);

  const averaged = new Array(dim).fill(0);
  for (let i = 0; i < vectors.length; i++) {
    const w = effectiveWeights[i] / weightSum;
    for (let j = 0; j < dim; j++) {
      averaged[j] += vectors[i][j] * w;
    }
  }

  // L2 normalize
  const norm = Math.sqrt(averaged.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < averaged.length; i++) {
      averaged[i] /= norm;
    }
  }

  return `[${averaged.join(',')}]`;
}

// =============================================================================
// Score Aggregation and Sorting
// =============================================================================

/**
 * Calculate final scores for all candidates.
 */
export function calculateScores(
  candidates: CandidateWithTagMatch[]
): ScoredArticleWithMeta[] {
  return candidates.map((c) => {
    const recencyDecay = calculateRecencyDecay(c.publishedAt);
    const finalScore = calculateFinalScore(
      c.embeddingSimilarity,
      c.hasTagMatch,
      recencyDecay
    );

    return {
      articleId: c.id,
      embeddingSimilarity: c.embeddingSimilarity,
      tagBoost: c.hasTagMatch ? DEFAULT_SCORE_PARAMETERS.tagBoostAlpha : 0,
      recencyDecay: recencyDecay * DEFAULT_SCORE_PARAMETERS.recencyBeta,
      finalScore,
      publishedAt: c.publishedAt,
      createdAt: c.createdAt,
      qualityScore: c.qualityScore,
      bookmarks: c.bookmarks,
      userVotes: c.userVotes,
    };
  });
}

/**
 * Apply requested sorting while preserving personalization defaults.
 */
export function sortArticles(
  candidates: ScoredArticleWithMeta[],
  sortBy: PersonalizedSortBy,
  sortOrder: 'asc' | 'desc'
): ScoredArticleWithMeta[] {
  const direction = sortOrder === 'asc' ? 1 : -1;

  // Secondary sort by finalScore for tie-breaking to ensure stable ordering
  const tieBreaker = (
    a: ScoredArticleWithMeta,
    b: ScoredArticleWithMeta
  ): number => b.finalScore - a.finalScore; // Always descending for tie-break

  const compare = (
    a: ScoredArticleWithMeta,
    b: ScoredArticleWithMeta
  ): number => {
    let primary: number;
    switch (sortBy) {
      case 'publishedAt':
        primary =
          (a.publishedAt.getTime() - b.publishedAt.getTime()) * direction;
        return primary !== 0 ? primary : tieBreaker(a, b);
      case 'createdAt':
        primary = (a.createdAt.getTime() - b.createdAt.getTime()) * direction;
        return primary !== 0 ? primary : tieBreaker(a, b);
      case 'qualityScore':
        primary = ((a.qualityScore ?? 0) - (b.qualityScore ?? 0)) * direction;
        return primary !== 0 ? primary : tieBreaker(a, b);
      case 'bookmarks':
        primary = ((a.bookmarks ?? 0) - (b.bookmarks ?? 0)) * direction;
        return primary !== 0 ? primary : tieBreaker(a, b);
      case 'userVotes':
        primary = ((a.userVotes ?? 0) - (b.userVotes ?? 0)) * direction;
        return primary !== 0 ? primary : tieBreaker(a, b);
      case 'finalScore':
      default:
        return (a.finalScore - b.finalScore) * direction;
    }
  };

  return [...candidates].sort(compare);
}
