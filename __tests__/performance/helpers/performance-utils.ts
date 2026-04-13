/**
 * Performance Measurement Utilities for Phase 2-A Tests
 *
 * Provides timing, percentile calculation, cache resets, and data seeding
 * for performance regression tests.
 *
 * @see Plan: plan_20251116_123239_756_phase2a-day6-performance-tests.md
 */

import type { DeepMockProxy } from 'jest-mock-extended';
import type { PrismaClient } from '@/lib/prisma-exports';
import { mockSourceGroups, mockSources, buildSource, buildSourceGroup } from '../../helpers/phase2a-test-fixtures';
import type { SourceGroupPlain } from '@/lib/types/source-grouping';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Measurement statistics from multiple runs
 */
export type MeasurementStats = {
  results: unknown[];
  timings: number[];
  median: number;
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
  metadata?: Record<string, unknown>;
};

/**
 * Performance metadata for logging
 */
export type PerfMetadata = {
  testName: string;
  seedSize: number;
  cacheState: 'cold' | 'warm';
  featureFlag: boolean;
};

/**
 * Options for measureMultipleRuns
 */
export type MeasureOptions = {
  runs?: number;
  warmupRuns?: number;
  metadata?: Record<string, unknown>;
};

// ============================================================================
// Defaults (documented for alignment)
// ============================================================================

const DEFAULT_RUNS = 15;
const DEFAULT_WARMUP_RUNS = 3;
const DEFAULT_MIN_SAMPLES = 5;

// ============================================================================
// 1. PerformanceTimer Class
// ============================================================================

/**
 * Simple timer using performance.now() for monotonic measurements
 */
export class PerformanceTimer {
  private startTime: number = 0;

  start(): void {
    this.startTime = performance.now();
  }

  stop(): number {
    if (this.startTime === 0) {
      throw new Error('Timer not started. Call start() before stop().');
    }
    const elapsed = performance.now() - this.startTime;
    this.startTime = 0; // Reset for reuse
    return elapsed; // milliseconds
  }
}

// ============================================================================
// 2. measureMultipleRuns Function
// ============================================================================

/**
 * Execute a function multiple times with warmup and collect statistics
 *
 * Warmup runs are executed silently to stabilize caches/JIT.
 * Timings are collected only for measured runs (after warmup).
 * If fn throws, the test fails loudly (no silent swallowing).
 *
 * @param fn - Async function to measure
 * @param options - Configuration (runs, warmupRuns, metadata)
 * @returns Measurement statistics
 */
export async function measureMultipleRuns<T>(
  fn: () => Promise<T>,
  options: MeasureOptions = {}
): Promise<MeasurementStats> {
  const runs = options.runs ?? DEFAULT_RUNS;
  const warmupRuns = options.warmupRuns ?? DEFAULT_WARMUP_RUNS;
  const metadata = options.metadata;

  // Validation
  if (runs <= 0) {
    throw new Error(`runs must be > 0, got ${runs}`);
  }
  if (warmupRuns < 0) {
    throw new Error(`warmupRuns must be >= 0, got ${warmupRuns}`);
  }

  // Warmup phase (silent, no results/timings collected)
  for (let i = 0; i < warmupRuns; i++) {
    await fn();
  }

  // Measured runs
  const results: T[] = [];
  const timings: number[] = [];
  const timer = new PerformanceTimer();

  for (let i = 0; i < runs; i++) {
    timer.start();
    const result = await fn();
    const elapsed = timer.stop();

    results.push(result);
    timings.push(elapsed);
  }

  // Calculate statistics
  const median = calculatePercentile(timings, 50);
  const p50 = median;
  const p95 = calculatePercentile(timings, 95);
  const p99 = calculatePercentile(timings, 99);
  const avg = timings.reduce((sum, t) => sum + t, 0) / timings.length;
  const min = Math.min(...timings);
  const max = Math.max(...timings);

  return {
    results,
    timings,
    median,
    p50,
    p95,
    p99,
    avg,
    min,
    max,
    ...(metadata && { metadata }),
  };
}

// ============================================================================
// 3. Percentile Calculation
// ============================================================================

/**
 * Calculate percentile using linear interpolation
 *
 * NOTE: This is a performance-test-specific implementation.
 * Uses linear interpolation for smooth percentile values across sample sizes.
 * Different from lib/ai/testing/stats.ts (ceil-based) which is optimized for AI metrics.
 *
 * @param values - Array of numbers
 * @param percentile - Percentile (0-100)
 * @returns Percentile value
 */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) {
    throw new Error('Cannot calculate percentile of empty array');
  }
  if (percentile < 0 || percentile > 100) {
    throw new Error(`Percentile must be 0-100, got ${percentile}`);
  }

  // Sort a copy to avoid mutating input
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  if (n === 1) {
    return sorted[0];
  }

  // Linear interpolation: rank = (p/100) * (n-1)
  const rank = (percentile / 100) * (n - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const fraction = rank - lowerIndex;

  // Interpolate between lower and upper values
  const lowerValue = sorted[lowerIndex];
  const upperValue = sorted[upperIndex];

  return lowerValue + fraction * (upperValue - lowerValue);
}

/**
 * Safe percentile calculation with minimum sample size guard
 *
 * Returns null if sample size is below threshold.
 * Callers decide whether to warn or fail.
 *
 * @param values - Array of numbers
 * @param percentile - Percentile (0-100)
 * @param minSamples - Minimum required samples (default: 5)
 * @returns Percentile value or null if insufficient samples
 */
export function safePercentile(
  values: number[],
  percentile: number,
  minSamples: number = DEFAULT_MIN_SAMPLES
): number | null {
  if (values.length < minSamples) {
    return null;
  }
  return calculatePercentile(values, percentile);
}

/**
 * Assert that a percentile is under a threshold
 *
 * Uses Jest expect with descriptive message for test failures.
 *
 * @param timings - Array of timing measurements
 * @param percentile - Percentile to check (0-100)
 * @param threshold - Maximum allowed value (ms)
 */
export function assertPercentileUnder(
  timings: number[],
  percentile: number,
  threshold: number
): void {
  const value = calculatePercentile(timings, percentile);
  expect(value).toBeLessThan(threshold);

  // Optionally log for debugging (even if assertion passes)
  if (process.env.LOG_PERF_METADATA === '1') {
    console.log(`[perf-assert] P${percentile} = ${value.toFixed(2)}ms (threshold: ${threshold}ms)`);
  }
}

// ============================================================================
// 4. Cache Reset Helpers
// ============================================================================

/**
 * TEST HELPER ONLY - DO NOT IMPORT FROM RUNTIME MODULES
 *
 * Reset SourceCache for tests
 *
 * Calls __resetSourceCacheForTests() and invalidates all caches.
 */
export async function resetSourceCache(): Promise<void> {
  const { __resetSourceCacheForTests, getSourceCache } = await import('@/lib/cache/source-cache');

  __resetSourceCacheForTests();
  await getSourceCache().invalidate();
}

/**
 * TEST HELPER ONLY - DO NOT IMPORT FROM RUNTIME MODULES
 *
 * Reset RedisCache for tests
 *
 * Clears the TestRedisClient store used by SourceCache and other caches.
 * This ensures cache MISS scenarios work correctly in tests.
 *
 * WARNING: Uses flushall() which clears ALL Redis keys in test environment.
 */
export async function resetRedisCache(): Promise<void> {
  // Get the TestRedisClient instance used by SourceCache
  const { getRedisClient } = await import('@/lib/redis/client');
  const redis = getRedisClient();

  // TestRedisClient supports flushall() to clear all keys
  if (typeof (redis as any).flushall === 'function') {
    await (redis as any).flushall();
  } else if (typeof (redis as any).clear === 'function') {
    // Fallback to clear() if flushall is not available
    await (redis as any).clear();
  } else {
    // Last resort: use keys() + del() pattern
    const keys = await redis.keys('*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

/**
 * TEST HELPER ONLY - DO NOT IMPORT FROM RUNTIME MODULES
 *
 * Reset all caches (SourceCache + RedisCache)
 *
 * WARNING: Clears ALL Redis keys in test environment via flushall().
 * Never call this from production code or shared E2E environments.
 */
export async function resetAllCaches(): Promise<void> {
  await Promise.all([
    resetSourceCache(),
    resetRedisCache(),
  ]);
}

// ============================================================================
// 5. Data Seeding
// ============================================================================

/**
 * Seed performance test data using phase2a fixtures
 *
 * Reuses mockSourceGroups/mockSources for consistency.
 * For sourceCount > mockSources.length, clones via buildSource with rotated IDs.
 *
 * @param prismaMock - Prisma mock instance
 * @param options - Seed configuration
 */
export async function seedPerformanceData(
  prismaMock: DeepMockProxy<PrismaClient>,
  options: {
    sourceCount?: number;
    groupCount?: number;
  } = {}
): Promise<void> {
  const sourceCount = options.sourceCount ?? 50;
  const groupCount = options.groupCount ?? 6;

  // Generate groups (reuse mockSourceGroups, repeat if needed)
  const groups: SourceGroupPlain[] = [];
  for (let i = 0; i < groupCount; i++) {
    const baseGroup = mockSourceGroups[i % mockSourceGroups.length];
    groups.push(buildSourceGroup({
      ...baseGroup,
      id: `${baseGroup.id}_${Math.floor(i / mockSourceGroups.length)}`,
      ordering: i,
    }));
  }

  // Generate sources (reuse mockSources, clone for larger counts)
  const sources = [];
  const tagNames = ['JavaScript', 'TypeScript', 'React', 'Node.js', 'AI/ML', 'Database', 'Security'];
  const now = new Date();

  for (let i = 0; i < sourceCount; i++) {
    const baseSource = mockSources[i % mockSources.length];
    const groupId = groups[i % groups.length].id;
    const articleCount = 10 + (i % 20);

    // Generate articles array for calculateSourceStats
    const articles = [];
    for (let j = 0; j < articleCount; j++) {
      const daysAgo = j * 3; // Stagger publishedAt over 90 days
      const publishedAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      const qualityScore = 60 + (j % 40); // Vary quality scores (60-99)
      const tags = [
        { name: tagNames[j % tagNames.length] },
        { name: tagNames[(j + 1) % tagNames.length] },
      ];

      articles.push({
        qualityScore,
        publishedAt,
        tags,
      });
    }

    sources.push({
      id: `${baseSource.id}_${Math.floor(i / mockSources.length)}`,
      name: `${baseSource.name} ${Math.floor(i / mockSources.length)}`,
      groupId,
      type: 'RSS',
      url: `https://example.com/${i}`,
      enabled: true,
      _count: { articles: articleCount },
      articles, // Add articles array for calculateSourceStats
    });
  }

  // Mock Prisma responses
  prismaMock.sourceGroup.findMany.mockResolvedValue(groups as any);
  prismaMock.source.findMany.mockResolvedValue(sources as any);
}

// ============================================================================
// 6. Metadata Logging
// ============================================================================

/**
 * Log performance metadata in structured JSON format
 *
 * Guarded by LOG_PERF_METADATA environment variable.
 * Prefix: [perf-meta] for easy grepping.
 *
 * @param metadata - Performance metadata
 */
export function logPerfMetadata(metadata: PerfMetadata): void {
  if (process.env.LOG_PERF_METADATA === '1') {
    console.log(`[perf-meta] ${JSON.stringify(metadata)}`);
  }
}
