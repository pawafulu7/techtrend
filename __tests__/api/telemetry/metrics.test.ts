/**
 * API Telemetry Metrics Tests
 */
import { GET } from '@/app/api/telemetry/metrics/route';
import { recommendationMetrics } from '@/lib/monitoring/recommendation-metrics';

describe('/api/telemetry/metrics', () => {
  beforeEach(() => {
    recommendationMetrics.reset();
  });

  describe('GET', () => {
    it('should return metrics structure with required fields', async () => {
      const response = await GET();
      expect(response.status).toBe(200);

      const data = await response.json();

      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('uptime');
      expect(data).toHaveProperty('cache');
      expect(data).toHaveProperty('database');
      expect(data).toHaveProperty('responseTime');
      expect(data).toHaveProperty('counters');
    });

    it('should return cache statistics', async () => {
      // Record some cache hits and misses
      recommendationMetrics.recordCacheHit(true);
      recommendationMetrics.recordCacheHit(true);
      recommendationMetrics.recordCacheHit(false);

      const response = await GET();
      const data = await response.json();

      expect(data.cache.hits).toBe(2);
      expect(data.cache.misses).toBe(1);
      expect(data.cache.hitRate).toBeCloseTo(66.67, 1);
    });

    it('should return database query statistics', async () => {
      recommendationMetrics.recordDatabaseQuery('select');
      recommendationMetrics.recordDatabaseQuery('select');
      recommendationMetrics.recordDatabaseQuery('insert');

      const response = await GET();
      const data = await response.json();

      expect(data.database.totalQueries).toBe(3);
      expect(data.counters['db:select']).toBe(2);
      expect(data.counters['db:insert']).toBe(1);
    });

    it('should return response time percentiles when data is recorded', async () => {
      // Record various response times
      const responseTimes = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      for (const time of responseTimes) {
        recommendationMetrics.recordResponseTime('testOperation', time);
      }

      const response = await GET();
      const data = await response.json();

      expect(data.responseTime).toHaveProperty('testOperation');
      expect(data.responseTime.testOperation).toHaveProperty('count');
      expect(data.responseTime.testOperation).toHaveProperty('min');
      expect(data.responseTime.testOperation).toHaveProperty('max');
      expect(data.responseTime.testOperation).toHaveProperty('avg');
      expect(data.responseTime.testOperation).toHaveProperty('p50');
      expect(data.responseTime.testOperation).toHaveProperty('p75');
      expect(data.responseTime.testOperation).toHaveProperty('p90');
      expect(data.responseTime.testOperation).toHaveProperty('p95');
      expect(data.responseTime.testOperation).toHaveProperty('p99');

      expect(data.responseTime.testOperation.count).toBe(10);
      expect(data.responseTime.testOperation.min).toBe(10);
      expect(data.responseTime.testOperation.max).toBe(100);
      expect(data.responseTime.testOperation.avg).toBe(55);
    });

    it('should return batch size percentiles when data is recorded', async () => {
      const batchSizes = [5, 10, 15, 20, 25];
      for (const size of batchSizes) {
        recommendationMetrics.recordBatchSize(size);
      }

      const response = await GET();
      const data = await response.json();

      expect(data.batchSize).not.toBeNull();
      expect(data.batchSize.count).toBe(5);
      expect(data.batchSize.min).toBe(5);
      expect(data.batchSize.max).toBe(25);
    });

    it('should have no-store cache control header', async () => {
      const response = await GET();
      expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    });

    it('should handle empty metrics gracefully', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.cache.hits).toBe(0);
      expect(data.cache.misses).toBe(0);
      expect(data.cache.hitRate).toBe(0);
      expect(data.database.totalQueries).toBe(0);
      expect(Object.keys(data.responseTime)).toHaveLength(0);
      expect(data.batchSize).toBeNull();
    });
  });
});

describe('RecommendationMetrics', () => {
  beforeEach(() => {
    recommendationMetrics.reset();
  });

  describe('getResponseTimePercentiles', () => {
    it('should return null for non-existent operation', () => {
      const result = recommendationMetrics.getResponseTimePercentiles('nonExistent');
      expect(result).toBeNull();
    });

    it('should calculate percentiles correctly for single value', () => {
      recommendationMetrics.recordResponseTime('single', 100);
      const result = recommendationMetrics.getResponseTimePercentiles('single');

      expect(result).not.toBeNull();
      expect(result!.count).toBe(1);
      expect(result!.min).toBe(100);
      expect(result!.max).toBe(100);
      expect(result!.avg).toBe(100);
      expect(result!.p50).toBe(100);
    });

    it('should calculate percentiles correctly for many values', () => {
      // Generate 100 values from 1 to 100
      for (let i = 1; i <= 100; i++) {
        recommendationMetrics.recordResponseTime('many', i);
      }

      const result = recommendationMetrics.getResponseTimePercentiles('many');

      expect(result).not.toBeNull();
      expect(result!.count).toBe(100);
      expect(result!.min).toBe(1);
      expect(result!.max).toBe(100);
      expect(result!.avg).toBe(50.5);
      // Percentiles use floor-based indices: sorted[Math.floor(len * percentile)]
      // For 100 values (1-100): p50 = sorted[50] = 51, p75 = sorted[75] = 76, etc.
      expect(result!.p50).toBe(51);
      expect(result!.p75).toBe(76);
      expect(result!.p90).toBe(91);
      expect(result!.p95).toBe(96);
      expect(result!.p99).toBe(100);
    });
  });

  describe('getAllResponseTimePercentiles', () => {
    it('should return empty object when no metrics recorded', () => {
      const result = recommendationMetrics.getAllResponseTimePercentiles();
      expect(result).toEqual({});
    });

    it('should return all recorded operations', () => {
      recommendationMetrics.recordResponseTime('op1', 10);
      recommendationMetrics.recordResponseTime('op2', 20);
      recommendationMetrics.recordResponseTime('op3', 30);

      const result = recommendationMetrics.getAllResponseTimePercentiles();

      expect(Object.keys(result)).toHaveLength(3);
      expect(result).toHaveProperty('op1');
      expect(result).toHaveProperty('op2');
      expect(result).toHaveProperty('op3');
    });
  });

  describe('getBatchSizePercentiles', () => {
    it('should return null when no batch sizes recorded', () => {
      const result = recommendationMetrics.getBatchSizePercentiles();
      expect(result).toBeNull();
    });

    it('should calculate batch size percentiles correctly', () => {
      for (let i = 1; i <= 10; i++) {
        recommendationMetrics.recordBatchSize(i * 10);
      }

      const result = recommendationMetrics.getBatchSizePercentiles();

      expect(result).not.toBeNull();
      expect(result!.count).toBe(10);
      expect(result!.min).toBe(10);
      expect(result!.max).toBe(100);
    });
  });
});
