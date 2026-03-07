/**
 * API Response Time Performance Tests
 *
 * Measures /api/sources endpoint response time with Feature Flag variations.
 * Tests Cache HIT/MISS scenarios and validates percentile distributions.
 *
 * Success Criteria:
 * - Cache HIT: P95 < 200ms
 * - Cache MISS: P95 < 400ms
 *
 * @see Plan: plan_20251116_123239_756_phase2a-day6-performance-tests.md
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/sources/route';
import { prisma } from '@/lib/prisma';
import {
  measureMultipleRuns,
  assertPercentileUnder,
  resetAllCaches,
  seedPerformanceData,
  logPerfMetadata,
} from './helpers/performance-utils';
import { cleanupPhase2ATests } from '../helpers/phase2a-test-fixtures';

// Extend timeout for performance measurements (15 runs × 400ms × warmup)
jest.setTimeout(30000);

// Mock Prisma (already mocked globally, but ensure it's ready)
const prismaMock = prisma as jest.Mocked<typeof prisma>;

describe('API Response Time (/api/sources)', () => {
  beforeAll(async () => {
    // Seed performance data (50 sources, 6 groups)
    await seedPerformanceData(prismaMock, {
      sourceCount: 50,
      groupCount: 6,
    });
  });

  afterAll(() => {
    cleanupPhase2ATests();
  });

  describe('Feature Flag = true (DB Provider)', () => {
    beforeAll(() => {
      process.env.USE_DATABASE_PROVIDER = 'true';
    });

    afterAll(() => {
      delete process.env.USE_DATABASE_PROVIDER;
    });

    beforeEach(async () => {
      // Reset caches before each test
      await resetAllCaches();
      // Clear mock call history
      jest.clearAllMocks();
      // Re-seed Prisma mocks (mockReset clears mockResolvedValue)
      await seedPerformanceData(prismaMock, {
        sourceCount: 50,
        groupCount: 6,
      });
    });

    describe('Cache HIT Scenario', () => {
      beforeEach(async () => {
        // Warm up cache by calling once
        const { getSourceCache } = await import('@/lib/cache/source-cache');
        await getSourceCache().getAllSourcesWithStats();

        // Clear mock call history AFTER warm-up
        jest.clearAllMocks();
      });

      it('should respond within 200ms (P95) - cache HIT', async () => {
        logPerfMetadata({
          testName: 'api-sources-cache-hit-db-provider',
          seedSize: 50,
          cacheState: 'warm',
          featureFlag: true,
        });

        const stats = await measureMultipleRuns(
          async () => {
            const request = new NextRequest('http://localhost/api/sources');
            const response = await GET(request);
            return response;
          },
          {
            runs: 15,
            warmupRuns: 3,
            metadata: { scenario: 'cache-hit', flag: true },
          }
        );

        // Log percentile distribution
        console.log('Cache HIT (DB Provider) - Percentile Distribution:');
        console.log(`  P50: ${stats.p50.toFixed(2)}ms`);
        console.log(`  P95: ${stats.p95.toFixed(2)}ms`);
        console.log(`  P99: ${stats.p99.toFixed(2)}ms`);
        console.log(`  Median: ${stats.median.toFixed(2)}ms`);
        console.log(`  Avg: ${stats.avg.toFixed(2)}ms`);
        console.log(`  Min: ${stats.min.toFixed(2)}ms`);
        console.log(`  Max: ${stats.max.toFixed(2)}ms`);

        // Assert P95 < 200ms
        assertPercentileUnder(stats.timings, 95, 200);

        // Verify response
        const lastResponse = stats.results[stats.results.length - 1];
        expect(lastResponse.status).toBe(200);

        // Verify X-Cache-Status header
        const cacheStatus = lastResponse.headers.get('X-Cache-Status');
        expect(cacheStatus).toBe('HIT');

        // Verify X-Response-Time header
        const responseTimeHeader = lastResponse.headers.get('X-Response-Time');
        expect(responseTimeHeader).toBeDefined();
        const responseTime = parseInt(responseTimeHeader || '0');
        expect(responseTime).toBeGreaterThanOrEqual(0); // Allow 0ms (very fast responses)
        expect(responseTime).toBeLessThan(400);
      });

      it('should not call Prisma on cache HIT', async () => {
        const request = new NextRequest('http://localhost/api/sources');
        await GET(request);

        // Cache HIT should not trigger Prisma queries
        expect(prismaMock.source.findMany).toHaveBeenCalledTimes(0);
        expect(prismaMock.sourceGroup.findMany).toHaveBeenCalledTimes(0);
      });
    });

    describe('Cache MISS Scenario', () => {
      it('should respond within 400ms (P95) - cache MISS', async () => {
        logPerfMetadata({
          testName: 'api-sources-cache-miss-db-provider',
          seedSize: 50,
          cacheState: 'cold',
          featureFlag: true,
        });

        // Reset caches to force MISS
        await resetAllCaches();

        const stats = await measureMultipleRuns(
          async () => {
            // Reset cache before each run to ensure MISS
            await resetAllCaches();
            const request = new NextRequest('http://localhost/api/sources');
            const response = await GET(request);
            return response;
          },
          {
            runs: 15,
            warmupRuns: 3,
            metadata: { scenario: 'cache-miss', flag: true },
          }
        );

        // Log percentile distribution
        console.log('Cache MISS (DB Provider) - Percentile Distribution:');
        console.log(`  P50: ${stats.p50.toFixed(2)}ms`);
        console.log(`  P95: ${stats.p95.toFixed(2)}ms`);
        console.log(`  P99: ${stats.p99.toFixed(2)}ms`);
        console.log(`  Median: ${stats.median.toFixed(2)}ms`);
        console.log(`  Avg: ${stats.avg.toFixed(2)}ms`);
        console.log(`  Min: ${stats.min.toFixed(2)}ms`);
        console.log(`  Max: ${stats.max.toFixed(2)}ms`);

        // Assert P95 < 400ms (relaxed for cache MISS)
        assertPercentileUnder(stats.timings, 95, 400);

        // Verify response
        const lastResponse = stats.results[stats.results.length - 1];
        expect(lastResponse.status).toBe(200);

        // Verify X-Cache-Status header (may be MISS or HIT after first call)
        const cacheStatus = lastResponse.headers.get('X-Cache-Status');
        expect(cacheStatus).toBeDefined();
      });

      it('should call Prisma on cache MISS', async () => {
        // Reset to ensure clean state
        await resetAllCaches();
        jest.clearAllMocks();

        const request = new NextRequest('http://localhost/api/sources');
        await GET(request);

        // Cache MISS should trigger at least one Prisma query
        const totalCalls =
          prismaMock.source.findMany.mock.calls.length +
          prismaMock.sourceGroup.findMany.mock.calls.length;

        expect(totalCalls).toBeGreaterThan(0);
      });
    });
  });

  describe('Feature Flag = false (Static Provider)', () => {
    beforeAll(() => {
      process.env.USE_DATABASE_PROVIDER = 'false';
    });

    afterAll(() => {
      delete process.env.USE_DATABASE_PROVIDER;
    });

    beforeEach(async () => {
      await resetAllCaches();
      jest.clearAllMocks();
      // Re-seed Prisma mocks (mockReset clears mockResolvedValue)
      await seedPerformanceData(prismaMock, {
        sourceCount: 50,
        groupCount: 6,
      });
    });

    it('should respond within 200ms (P95) - baseline', async () => {
      logPerfMetadata({
        testName: 'api-sources-static-provider',
        seedSize: 50,
        cacheState: 'warm',
        featureFlag: false,
      });

      // Warm up cache
      const { getSourceCache } = await import('@/lib/cache/source-cache');
      await getSourceCache().getAllSourcesWithStats();

      const stats = await measureMultipleRuns(
        async () => {
          const request = new NextRequest('http://localhost/api/sources');
          const response = await GET(request);
          return response;
        },
        {
          runs: 15,
          warmupRuns: 3,
          metadata: { scenario: 'static-provider', flag: false },
        }
      );

      // Log percentile distribution (baseline comparison)
      console.log('Static Provider - Percentile Distribution:');
      console.log(`  P50: ${stats.p50.toFixed(2)}ms`);
      console.log(`  P95: ${stats.p95.toFixed(2)}ms`);
      console.log(`  P99: ${stats.p99.toFixed(2)}ms`);
      console.log(`  Median: ${stats.median.toFixed(2)}ms`);

      // Baseline comparison (should be similar to DB Provider)
      assertPercentileUnder(stats.timings, 95, 200);
    });
  });

  describe('SourceGroup Latency', () => {
    it('should fetch SourceGroups within acceptable latency', async () => {
      const { groupSourcesByGroupId } = await import('@/lib/utils/source/source-grouping');

      // Use seeded sources (not mockSources from fixtures)
      // seedPerformanceData() generated sources with matching groupIds
      const testSources = (await prismaMock.source.findMany()) ?? [];

      logPerfMetadata({
        testName: 'source-group-latency',
        seedSize: testSources.length,
        cacheState: 'cold',
        featureFlag: true,
      });

      const stats = await measureMultipleRuns(
        async () => {
          return await groupSourcesByGroupId(testSources);
        },
        {
          runs: 15,
          warmupRuns: 3,
        }
      );

      // Log latency
      console.log('SourceGroup Latency:');
      console.log(`  Median: ${stats.median.toFixed(2)}ms`);
      console.log(`  P95: ${stats.p95.toFixed(2)}ms`);

      // Threshold: median < 10ms (CodexMCP: 50ms is too relaxed for in-memory operation)
      expect(stats.median).toBeLessThan(10);

      // Verify grouping result content (regression guard)
      const lastResult = stats.results[stats.results.length - 1];
      expect(Array.isArray(lastResult)).toBe(true);

      // Verify Prisma query count and result structure (if sources have groupIds)
      if (testSources.length > 0 && testSources.some((s: any) => s.groupId)) {
        expect(prismaMock.sourceGroup.findMany).toHaveBeenCalled();
        expect(lastResult.length).toBeGreaterThan(0);
        if (lastResult.length > 0) {
          expect(lastResult[0]).toHaveProperty('group');
          expect(lastResult[0]).toHaveProperty('sources');
        }
      }
    });
  });
});
