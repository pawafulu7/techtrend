/**
 * Cache Telemetry API Tests
 */
import { GET } from '@/app/api/telemetry/cache/route';
import { CacheMetrics } from '@/lib/monitoring/cache-metrics';

describe('/api/telemetry/cache', () => {
  let metrics: CacheMetrics;

  beforeEach(() => {
    // Use getInstance and reset to work with the same singleton as the API
    metrics = CacheMetrics.getInstance();
    metrics.reset();
  });

  describe('GET', () => {
    it('should return cache metrics summary with required fields', async () => {
      const response = await GET();
      expect(response.status).toBe(200);

      const data = await response.json();

      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('uptime');
      expect(data).toHaveProperty('totals');
      expect(data).toHaveProperty('rates');
      expect(data).toHaveProperty('responseTime');
      expect(data).toHaveProperty('byNamespace');
      expect(data).toHaveProperty('recentOperations');
    });

    it('should return totals structure', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.totals).toHaveProperty('hits');
      expect(data.totals).toHaveProperty('misses');
      expect(data.totals).toHaveProperty('stale');
      expect(data.totals).toHaveProperty('errors');
      expect(data.totals).toHaveProperty('total');
    });

    it('should return rates structure', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.rates).toHaveProperty('hitRate');
      expect(data.rates).toHaveProperty('missRate');
      expect(data.rates).toHaveProperty('staleRate');
      expect(data.rates).toHaveProperty('errorRate');
    });

    it('should reflect recorded operations', async () => {
      metrics.hit('key-1', 10, 'test');
      metrics.hit('key-2', 15, 'test');
      metrics.miss('key-3', 100, 'test');

      const response = await GET();
      const data = await response.json();

      expect(data.totals.hits).toBe(2);
      expect(data.totals.misses).toBe(1);
      expect(data.totals.total).toBe(3);
      expect(data.rates.hitRate).toBeCloseTo(66.67, 1);
    });

    it('should have no-store cache control header', async () => {
      const response = await GET();
      expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    });
  });
});
