/**
 * API Baseline Telemetry Tests
 */
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/telemetry/baseline/route';
import { ApiBaselineMonitor } from '@/lib/monitoring/api-baseline';

describe('/api/telemetry/baseline', () => {
  beforeEach(() => {
    ApiBaselineMonitor.resetInstance();
    ApiBaselineMonitor.getInstance().resetMeasurements();
  });

  describe('GET', () => {
    it('should return baseline summary with required fields', async () => {
      const response = await GET();
      expect(response.status).toBe(200);

      const data = await response.json();

      expect(data).toHaveProperty('baselines');
      expect(data).toHaveProperty('measurements');
      expect(data).toHaveProperty('comparisons');
      expect(data).toHaveProperty('summary');
    });

    it('should return default baselines', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.baselines.length).toBeGreaterThan(0);
      expect(data.baselines[0]).toHaveProperty('endpoint');
      expect(data.baselines[0]).toHaveProperty('p50Baseline');
    });

    it('should have no-store cache control header', async () => {
      const response = await GET();
      expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    });
  });

  describe('POST', () => {
    it('should record a measurement', async () => {
      const payload = {
        endpoint: '/api/articles',
        method: 'GET',
        p50: 90,
        p95: 220,
        p99: 450,
        count: 100,
      };

      const request = new NextRequest('http://localhost/api/telemetry/baseline', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.message).toBe('Measurement recorded');

      // Verify measurement was recorded
      const getResponse = await GET();
      const getData = await getResponse.json();
      expect(getData.measurements).toHaveLength(1);
    });

    it('should reject invalid method', async () => {
      const payload = {
        endpoint: '/api/articles',
        method: 'INVALID',
        p50: 90,
        p95: 220,
        p99: 450,
        count: 100,
      };

      const request = new NextRequest('http://localhost/api/telemetry/baseline', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('should reject missing fields', async () => {
      const payload = {
        endpoint: '/api/articles',
        method: 'GET',
        // Missing p50, p95, p99, count
      };

      const request = new NextRequest('http://localhost/api/telemetry/baseline', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });
});
