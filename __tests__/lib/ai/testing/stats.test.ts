import {
  percentile,
  percentiles,
  calculateStats,
  calculateCategoryStats,
} from '@/lib/ai/testing/stats';

describe('percentile', () => {
  it('should calculate P50 (median)', () => {
    const values = [1, 2, 3, 4, 5];
    expect(percentile(values, 50)).toBe(3);
  });

  it('should calculate P95', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 95)).toBe(95);
  });

  it('should calculate P99', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 99)).toBe(99);
  });

  it('should return 0 for empty array', () => {
    expect(percentile([], 50)).toBe(0);
  });

  it('should handle single element array', () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 95)).toBe(42);
  });

  it('should handle unsorted arrays', () => {
    const values = [5, 1, 3, 2, 4];
    expect(percentile(values, 50)).toBe(3);
  });
});

describe('percentiles', () => {
  it('should calculate multiple percentiles', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const result = percentiles(values, [50, 75, 90, 95, 99]);

    expect(result).toEqual({
      p50: 50,
      p75: 75,
      p90: 90,
      p95: 95,
      p99: 99,
    });
  });

  it('should return empty object for empty percentile list', () => {
    const values = [1, 2, 3, 4, 5];
    const result = percentiles(values, []);

    expect(result).toEqual({});
  });
});

describe('calculateStats', () => {
  it('should calculate basic statistics', () => {
    const values = [1, 2, 3, 4, 5];
    const stats = calculateStats(values);

    expect(stats.count).toBe(5);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(5);
    expect(stats.mean).toBe(3);
    expect(stats.median).toBe(3);
    expect(stats.stddev).toBeCloseTo(1.414, 2);
  });

  it('should return zeros for empty array', () => {
    const stats = calculateStats([]);

    expect(stats).toEqual({
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      stddev: 0,
    });
  });

  it('should handle single element', () => {
    const stats = calculateStats([42]);

    expect(stats.count).toBe(1);
    expect(stats.min).toBe(42);
    expect(stats.max).toBe(42);
    expect(stats.mean).toBe(42);
    expect(stats.median).toBe(42);
    expect(stats.stddev).toBe(0);
  });

  it('should handle identical values', () => {
    const stats = calculateStats([5, 5, 5, 5, 5]);

    expect(stats.count).toBe(5);
    expect(stats.min).toBe(5);
    expect(stats.max).toBe(5);
    expect(stats.mean).toBe(5);
    expect(stats.median).toBe(5);
    expect(stats.stddev).toBe(0);
  });
});

describe('calculateCategoryStats', () => {
  it('should calculate stats by category', () => {
    const results = [
      { category: 'general', value: 0.95 },
      { category: 'general', value: 0.96 },
      { category: 'technical', value: 0.92 },
      { category: 'technical', value: 0.93 },
    ];

    const stats = calculateCategoryStats(results);

    expect(stats.general.count).toBe(2);
    expect(stats.general.mean).toBeCloseTo(0.955, 3);
    expect(stats.technical.count).toBe(2);
    expect(stats.technical.mean).toBeCloseTo(0.925, 3);
  });

  it('should handle empty results', () => {
    const stats = calculateCategoryStats([]);

    expect(stats).toEqual({});
  });

  it('should handle single category', () => {
    const results = [
      { category: 'general', value: 0.95 },
      { category: 'general', value: 0.96 },
    ];

    const stats = calculateCategoryStats(results);

    expect(Object.keys(stats)).toEqual(['general']);
    expect(stats.general.count).toBe(2);
  });
});
