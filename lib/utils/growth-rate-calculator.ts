import { GROWTH_RATE_CLIP } from '@/lib/types/trend-types';

export interface GrowthRateOptions {
  clipMin?: number;
  clipMax?: number;
}

const DEFAULT_OPTIONS: Required<GrowthRateOptions> = {
  clipMin: GROWTH_RATE_CLIP.MIN,
  clipMax: GROWTH_RATE_CLIP.MAX,
};

/**
 * Calculate growth rate between two periods.
 * Result is clipped to [clipMin, clipMax] to prevent outliers.
 */
export function calculateGrowthRate(
  current: number,
  previous: number,
  options?: GrowthRateOptions
): number {
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

  if (totalAvailable === 0) return {};

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
  if (scale <= 0) {
    throw new RangeError('scale must be positive');
  }
  return 100 / (1 + Math.exp(-rawScore / scale));
}
