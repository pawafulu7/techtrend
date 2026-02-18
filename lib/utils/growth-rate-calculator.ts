import { GROWTH_RATE_CLIP } from '@/lib/types/trend-types';

export interface GrowthRateOptions {
  clipMin?: number;
  clipMax?: number;
  minDataPoints?: number;
}

const DEFAULT_OPTIONS: Required<GrowthRateOptions> = {
  clipMin: GROWTH_RATE_CLIP.MIN,
  clipMax: GROWTH_RATE_CLIP.MAX,
  minDataPoints: 5,
};

/**
 * Calculate growth rate between two periods.
 * Returns null if insufficient data points.
 */
export function calculateGrowthRate(
  current: number,
  previous: number,
  options?: GrowthRateOptions
): number | null {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let rate: number;
  if (previous > 0) {
    rate = ((current - previous) / previous) * 100;
  } else if (current > 0) {
    rate = 100;
  } else {
    rate = 0;
  }

  // Clip to prevent outliers
  return Math.max(opts.clipMin, Math.min(opts.clipMax, rate));
}

/**
 * Redistribute weights when some components are missing.
 * Maintains relative proportions of available weights.
 */
export function redistributeWeights(
  weights: Record<string, number>,
  availableKeys: Set<string>
): Record<string, number> {
  const available = Object.entries(weights).filter(([k]) =>
    availableKeys.has(k)
  );
  const totalAvailable = available.reduce((sum, [, w]) => sum + w, 0);

  if (totalAvailable === 0) return weights;

  const result: Record<string, number> = {};
  for (const [key, weight] of available) {
    result[key] = weight / totalAvailable;
  }
  return result;
}

/**
 * Normalize raw score to 0-100 using sigmoid function.
 */
export function sigmoidNormalize(rawScore: number, scale: number = 50): number {
  return 100 / (1 + Math.exp(-rawScore / scale));
}
