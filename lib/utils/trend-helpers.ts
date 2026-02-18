import type { TrendScoreResult } from '@/lib/types/trend-types';

/**
 * Compute the most recent calculatedAt timestamp from a list of trend scores.
 * Returns null when the list is empty.
 */
export function computeLastUpdatedAt(
  scores: Pick<TrendScoreResult, 'calculatedAt'>[]
): string | null {
  if (scores.length === 0) return null;
  return scores.reduce(
    (latest, score) =>
      score.calculatedAt > latest ? score.calculatedAt : latest,
    scores[0].calculatedAt
  );
}
