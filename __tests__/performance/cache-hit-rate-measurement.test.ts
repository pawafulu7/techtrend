/**
 * Cache Hit Rate Measurement Tests
 *
 * Measures Redis cache hit rate and validates cache logic.
 * Two layers: Mock Redis (CI-stable) + Opt-in Real Redis (dev only).
 *
 * Success Criteria:
 * - Hit rate >= 85% with typical access pattern
 * - TTL expiry behavior correct
 *
 * @see Plan: plan_20251116_123239_756_phase2a-day6-performance-tests.md
 */

import { RedisCache } from '@/lib/cache/redis-cache';
import { prisma } from '@/lib/database';
import { getRedisClient } from '@/lib/redis/client';
import { measureMultipleRuns } from './helpers/performance-utils';

// Extend timeout for performance measurements
jest.setTimeout(30000);

// Prisma mock
const prismaMock = prisma as jest.Mocked<typeof prisma>;

// ============================================================================
// Layer 1: Mock Redis (hit-rate logic validation)
// ============================================================================

describe('Cache Hit Rate Logic (Mock Redis)', () => {
  describe('Hit Rate Measurement', () => {
    it('should achieve 85%+ hit rate with typical access pattern', async () => {
      // Create fresh cache instance to isolate stats
      const cache = new RedisCache({
        ttl: 300,
        namespace: `test-hitrate-${Date.now()}`,
      });

      // Access pattern: 100 requests, 15 unique keys (85% duplicates)
      const totalRequests = 100;
      const uniqueKeys = 15;

      for (let i = 0; i < totalRequests; i++) {
        const key = `key-${i % uniqueKeys}`;
        await cache.getOrSet(key, async () => `value-${key}`);
      }

      // Calculate hit rate using getStats() API
      const { hits, misses } = cache.getStats();
      const total = hits + misses;
      const hitRate = total > 0 ? hits / total : 0;

      console.log('Hit Rate Measurement:');
      console.log(`  Total requests: ${totalRequests}`);
      console.log(`  Unique keys: ${uniqueKeys}`);
      console.log(`  Hits: ${hits}`);
      console.log(`  Misses: ${misses}`);
      console.log(`  Hit rate: ${(hitRate * 100).toFixed(2)}%`);

      // Assert hit rate >= 85%
      expect(hitRate).toBeGreaterThanOrEqual(0.85);

      // Assert individual counters
      expect(hits).toBeGreaterThan(0);
      expect(misses).toBe(uniqueKeys); // First access of each key is a MISS
      expect(hits).toBe(totalRequests - uniqueKeys);
    });

    it('should track hits and misses separately', async () => {
      const cache = new RedisCache({
        namespace: `test-separate-${Date.now()}`,
      });

      // First access: MISS
      await cache.getOrSet('key1', async () => 'value1');
      expect(cache.getStats().misses).toBe(1);
      expect(cache.getStats().hits).toBe(0);

      // Second access: HIT
      await cache.getOrSet('key1', async () => 'value1');
      expect(cache.getStats().hits).toBe(1);
      expect(cache.getStats().misses).toBe(1);

      // Third access: HIT
      await cache.getOrSet('key1', async () => 'value1');
      expect(cache.getStats().hits).toBe(2);
      expect(cache.getStats().misses).toBe(1);
    });
  });

  describe('DB Provider Cache Key Usage', () => {
    beforeEach(async () => {
      // Stub Prisma to return empty arrays (avoid full seedPerformanceData)
      if (prismaMock.source && prismaMock.source.findMany) {
        prismaMock.source.findMany.mockResolvedValue([] as any);
      }
      if (prismaMock.sourceGroup && prismaMock.sourceGroup.findMany) {
        prismaMock.sourceGroup.findMany.mockResolvedValue([] as any);
      }

      // Reset SourceCache singleton
      const { __resetSourceCacheForTests } = await import('@/lib/cache/source-cache');
      __resetSourceCacheForTests();
    });

    it('should use correct cache keys for SourceCache methods', async () => {
      const { getSourceCache } = await import('@/lib/cache/source-cache');
      const sourceCache = getSourceCache();
      const cacheInstance = (sourceCache as any).cache;
      const getSpy = jest.spyOn(cacheInstance, 'get');

      // Call getAllSourcesWithStats
      await sourceCache.getAllSourcesWithStats();

      // Verify cache key used
      const getKeys = getSpy.mock.calls.map((call) => call[0]);
      const matchedKey = getKeys.find((k: string) => k.includes('all-sources-with-stats'));

      expect(matchedKey).toBeDefined();
      console.log(`getAllSourcesWithStats() used cache key: ${matchedKey}`);

      getSpy.mockRestore();
    });

    it('should use group-specific cache keys', async () => {
      const { getSourceCache } = await import('@/lib/cache/source-cache');
      const sourceCache = getSourceCache();
      const cacheInstance = (sourceCache as any).cache;
      const getSpy = jest.spyOn(cacheInstance, 'get');

      // Call getCompanySourcesByGroup
      await sourceCache.getCompanySourcesByGroup('group_company_japan');

      // Verify cache key includes group ID
      const getKeys = getSpy.mock.calls.map((call) => call[0]);
      const matchedKey = getKeys.find((k: string) => k.includes('company-sources:group:group_company_japan'));

      expect(matchedKey).toBeDefined();
      console.log(`getCompanySourcesByGroup() used cache key: ${matchedKey}`);

      getSpy.mockRestore();
    });
  });

  describe('TTL Expiry Behavior', () => {
    it('should handle TTL expiry correctly with fake timers', async () => {
      jest.useFakeTimers({ advanceTimers: true });

      try {
        const cache = new RedisCache({
          ttl: 1, // 1 second
          namespace: `test-ttl-${Date.now()}`,
        });

        // Set value with 1 second TTL
        await cache.set('ttl-key', 'ttl-value', 1);

        // Flush microtasks
        await Promise.resolve();

        // Initial access: HIT
        let result = await cache.get('ttl-key');
        expect(result).toBe('ttl-value');
        expect(cache.getStats().hits).toBe(1);

        // Advance time by 2 seconds (TTL expired)
        jest.advanceTimersByTime(2000);
        await Promise.resolve();

        // Access after TTL: MISS
        result = await cache.get('ttl-key');
        expect(result).toBeNull();
        expect(cache.getStats().misses).toBe(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

// ============================================================================
// Layer 2: Real Redis (opt-in performance validation)
// ============================================================================

const runPerfTests = process.env.RUN_PERF_TESTS === 'true';

(runPerfTests ? describe : describe.skip)('Cache Performance (Real Redis)', () => {
  beforeAll(async () => {
    // Check Redis connection
    const redis = getRedisClient();
    try {
      await redis.ping();
      console.log('Real Redis connection verified');
    } catch (err) {
      throw new Error(
        'Real Redis not available. Start docker compose first: docker compose up redis -d'
      );
    }
  });

  afterAll(async () => {
    // Clean up test namespace (match namespace prefix pattern)
    const redis = getRedisClient();
    const keys = await redis.keys('perf-test*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  it('should achieve < 20ms latency for cache hits', async () => {
    const cache = new RedisCache({
      ttl: 300,
      namespace: `perf-test-${Date.now()}`,
    });

    // Warm up
    await cache.set('perf-key', 'perf-value');

    // Measure hit latency
    const stats = await measureMultipleRuns(
      async () => {
        return await cache.get('perf-key');
      },
      {
        runs: 15,
        warmupRuns: 3,
      }
    );

    console.log('Real Redis Cache HIT Latency:');
    console.log(`  Median: ${stats.median.toFixed(2)}ms`);
    console.log(`  P95: ${stats.p95.toFixed(2)}ms`);

    // Assert median < threshold (overridable via env var)
    const threshold = Number(process.env.REDIS_HIT_MEDIAN_THRESHOLD ?? '20');
    expect(stats.median).toBeLessThan(threshold);
  });

  it('should measure actual hit rate in production-like scenario', async () => {
    const cache = new RedisCache({
      ttl: 300,
      namespace: `perf-test-scenario-${Date.now()}`,
    });

    // Simulate production access pattern
    const totalRequests = 100;
    const uniqueKeys = 20; // 80% duplicates

    for (let i = 0; i < totalRequests; i++) {
      const key = `scenario-key-${i % uniqueKeys}`;
      await cache.getOrSet(key, async () => `scenario-value-${key}`);
    }

    // Calculate hit rate using getStats() API
    const { hits, misses } = cache.getStats();
    const total = hits + misses;
    const hitRate = total > 0 ? hits / total : 0;

    console.log('Real Redis Hit Rate (Production-like):');
    console.log(`  Hits: ${hits}`);
    console.log(`  Misses: ${misses}`);
    console.log(`  Hit rate: ${(hitRate * 100).toFixed(2)}%`);

    // Should be close to 80% (unique keys / total)
    expect(hitRate).toBeGreaterThanOrEqual(0.75);
  });
});
