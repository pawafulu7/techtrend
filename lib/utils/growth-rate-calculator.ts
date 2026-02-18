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
 * Calculate percentage growth rate between two measurement periods.
 *
 * Domain assumptions:
 * - Input values represent non-negative count metrics (article mentions,
 *   GitHub stars, npm downloads, Stack Overflow questions).
 * - Negative inputs are not expected but will not throw; they are handled
 *   by the same formula (percentage change).
 *
 * Behavior when `previous <= 0`:
 * - If `previous <= 0` and `current > 0`: returns 100 (treated as full emergence).
 * - If both `previous <= 0` and `current <= 0`: returns 0 (no activity).
 *
 * The result is clipped to [clipMin, clipMax] (default: [-100, 500]) to
 * prevent outlier values from skewing composite trend scores.
 *
 * @param current  - Metric value for the recent period.
 * @param previous - Metric value for the preceding period.
 * @param options  - Optional clip bounds override.
 * @returns Percentage growth rate, clipped to the configured range.
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
