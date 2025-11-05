export interface StatsSummary {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stddev: number;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function percentiles(
  values: number[],
  ps: number[]
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const p of ps) {
    result[`p${p}`] = percentile(values, p);
  }
  return result;
}

export function calculateStats(values: number[]): StatsSummary {
  if (values.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, median: 0, stddev: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = values.length;
  const min = sorted[0];
  const max = sorted[count - 1];
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  const median = percentile(values, 50);

  const variance =
    values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
  const stddev = Math.sqrt(variance);

  return { count, min, max, mean, median, stddev };
}

export function calculateCategoryStats(
  results: Array<{ category: string; value: number }>
): Record<string, StatsSummary> {
  const byCategory: Record<string, number[]> = {};

  for (const { category, value } of results) {
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    byCategory[category].push(value);
  }

  const stats: Record<string, StatsSummary> = {};
  for (const [category, values] of Object.entries(byCategory)) {
    stats[category] = calculateStats(values);
  }

  return stats;
}
