/**
 * Cache Metrics Tests
 */
import {
  CacheMetrics,
  withCacheMetrics,
} from '@/lib/monitoring/cache-metrics';

describe('CacheMetrics', () => {
  let metrics: CacheMetrics;

  beforeEach(() => {
    CacheMetrics.resetInstance();
    metrics = CacheMetrics.getInstance();
  });

  describe('recordOperation', () => {
    it('should record cache hit', () => {
      metrics.hit('test-key', 10, 'articles');

      const summary = metrics.getSummary();
      expect(summary.totals.hits).toBe(1);
      expect(summary.totals.total).toBe(1);
      expect(summary.rates.hitRate).toBe(100);
    });

    it('should record cache miss', () => {
      metrics.miss('test-key', 50, 'articles');

      const summary = metrics.getSummary();
      expect(summary.totals.misses).toBe(1);
      expect(summary.rates.missRate).toBe(100);
    });

    it('should record stale hit', () => {
      metrics.stale('test-key', 15, 'articles');

      const summary = metrics.getSummary();
      expect(summary.totals.stale).toBe(1);
      expect(summary.rates.staleRate).toBe(100);
    });

    it('should record error', () => {
      metrics.error('test-key', 5, 'articles');

      const summary = metrics.getSummary();
      expect(summary.totals.errors).toBe(1);
      expect(summary.rates.errorRate).toBe(100);
    });

    it('should calculate rates correctly with mixed operations', () => {
      // 7 hits, 2 misses, 1 stale = 70% hit rate, 20% miss rate, 10% stale rate
      for (let i = 0; i < 7; i++) {
        metrics.hit(`key-${i}`, 10);
      }
      metrics.miss('key-miss-1', 50);
      metrics.miss('key-miss-2', 55);
      metrics.stale('key-stale', 12);

      const summary = metrics.getSummary();
      expect(summary.totals.hits).toBe(7);
      expect(summary.totals.misses).toBe(2);
      expect(summary.totals.stale).toBe(1);
      expect(summary.totals.total).toBe(10);
      expect(summary.rates.hitRate).toBe(70);
      expect(summary.rates.missRate).toBe(20);
      expect(summary.rates.staleRate).toBe(10);
    });
  });

  describe('response time tracking', () => {
    it('should calculate latency stats for hits', () => {
      metrics.hit('key-1', 10);
      metrics.hit('key-2', 20);
      metrics.hit('key-3', 30);

      const summary = metrics.getSummary();
      const hitStats = summary.responseTime.hit;

      expect(hitStats).not.toBeNull();
      expect(hitStats!.count).toBe(3);
      expect(hitStats!.avg).toBe(20);
      expect(hitStats!.min).toBe(10);
      expect(hitStats!.max).toBe(30);
    });

    it('should calculate latency stats for misses', () => {
      metrics.miss('key-1', 100);
      metrics.miss('key-2', 200);

      const summary = metrics.getSummary();
      const missStats = summary.responseTime.miss;

      expect(missStats).not.toBeNull();
      expect(missStats!.count).toBe(2);
      expect(missStats!.avg).toBe(150);
    });

    it('should return null for empty operation types', () => {
      metrics.hit('key', 10);

      const summary = metrics.getSummary();
      expect(summary.responseTime.hit).not.toBeNull();
      expect(summary.responseTime.miss).toBeNull();
      expect(summary.responseTime.stale).toBeNull();
    });
  });

  describe('namespace tracking', () => {
    it('should track metrics by namespace', () => {
      metrics.hit('key-1', 10, 'articles');
      metrics.hit('key-2', 10, 'articles');
      metrics.miss('key-3', 50, 'articles');
      metrics.hit('key-4', 10, 'summaries');

      const summary = metrics.getSummary();

      expect(summary.byNamespace).toHaveProperty('articles');
      expect(summary.byNamespace).toHaveProperty('summaries');
      expect(summary.byNamespace.articles.hits).toBe(2);
      expect(summary.byNamespace.articles.misses).toBe(1);
      expect(summary.byNamespace.articles.hitRate).toBeCloseTo(66.67, 1);
      expect(summary.byNamespace.summaries.hits).toBe(1);
      expect(summary.byNamespace.summaries.hitRate).toBe(100);
    });
  });

  describe('getSummary', () => {
    it('should return empty summary when no operations recorded', () => {
      const summary = metrics.getSummary();

      expect(summary.totals.total).toBe(0);
      expect(summary.rates.hitRate).toBe(0);
      expect(summary.uptime).toBeGreaterThanOrEqual(0);
      expect(summary.recentOperations).toBe(0);
    });

    it('should include timestamp', () => {
      const summary = metrics.getSummary();
      expect(summary.timestamp).toBeDefined();
      expect(new Date(summary.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      metrics.hit('key-1', 10);
      metrics.miss('key-2', 50);

      metrics.reset();

      const summary = metrics.getSummary();
      expect(summary.totals.total).toBe(0);
      expect(summary.recentOperations).toBe(0);
    });
  });
});

describe('withCacheMetrics', () => {
  let metrics: CacheMetrics;

  beforeEach(() => {
    // Reset and get the same instance used by cacheMetrics export
    metrics = CacheMetrics.getInstance();
    metrics.reset();
  });

  it('should record hit status', async () => {
    const result = await withCacheMetrics(
      'test-key',
      async () => ({ data: 'value', status: 'hit' as const }),
      'test'
    );

    expect(result).toBe('value');

    const summary = metrics.getSummary();
    expect(summary.totals.hits).toBe(1);
  });

  it('should record miss status', async () => {
    const result = await withCacheMetrics(
      'test-key',
      async () => ({ data: 'value', status: 'miss' as const }),
      'test'
    );

    expect(result).toBe('value');

    const summary = metrics.getSummary();
    expect(summary.totals.misses).toBe(1);
  });

  it('should record error on exception', async () => {
    await expect(
      withCacheMetrics(
        'test-key',
        async () => {
          throw new Error('Cache error');
        },
        'test'
      )
    ).rejects.toThrow('Cache error');

    const summary = metrics.getSummary();
    expect(summary.totals.errors).toBe(1);
  });
});
