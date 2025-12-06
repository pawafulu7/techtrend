/**
 * Web Vitals Telemetry API Tests
 */
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/telemetry/vitals/route';

describe('/api/telemetry/vitals', () => {
  describe('POST', () => {
    it('should accept valid Web Vitals payload', async () => {
      const payload = {
        name: 'LCP',
        value: 2500,
        delta: 2500,
        id: 'v3-1234567890',
        rating: 'good',
        navigationType: 'navigate',
        page: '/',
        timestamp: Date.now(),
      };

      const request = new NextRequest('http://localhost/api/telemetry/vitals', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(204);
    });

    it('should accept all metric types', async () => {
      const metricTypes = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const;

      for (const name of metricTypes) {
        const payload = {
          name,
          value: 100,
          delta: 100,
          id: `v3-${name}-test`,
          rating: 'good',
          navigationType: 'navigate',
          page: '/',
          timestamp: Date.now(),
        };

        const request = new NextRequest('http://localhost/api/telemetry/vitals', {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const response = await POST(request);
        expect(response.status).toBe(204);
      }
    });

    it('should reject invalid metric name', async () => {
      const payload = {
        name: 'INVALID',
        value: 100,
        delta: 100,
        id: 'v3-test',
        rating: 'good',
        navigationType: 'navigate',
        page: '/',
        timestamp: Date.now(),
      };

      const request = new NextRequest('http://localhost/api/telemetry/vitals', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('should reject missing required fields', async () => {
      const payload = {
        name: 'LCP',
        // Missing value, delta, etc.
      };

      const request = new NextRequest('http://localhost/api/telemetry/vitals', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('should accept all rating types', async () => {
      const ratings = ['good', 'needs-improvement', 'poor'] as const;

      for (const rating of ratings) {
        const payload = {
          name: 'LCP',
          value: 2500,
          delta: 2500,
          id: `v3-rating-${rating}`,
          rating,
          navigationType: 'navigate',
          page: '/',
          timestamp: Date.now(),
        };

        const request = new NextRequest('http://localhost/api/telemetry/vitals', {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const response = await POST(request);
        expect(response.status).toBe(204);
      }
    });

    it('should accept all navigation types', async () => {
      const navTypes = [
        'navigate',
        'reload',
        'back-forward',
        'back-forward-cache',
        'prerender',
      ] as const;

      for (const navigationType of navTypes) {
        const payload = {
          name: 'LCP',
          value: 2500,
          delta: 2500,
          id: `v3-nav-${navigationType}`,
          rating: 'good',
          navigationType,
          page: '/',
          timestamp: Date.now(),
        };

        const request = new NextRequest('http://localhost/api/telemetry/vitals', {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const response = await POST(request);
        expect(response.status).toBe(204);
      }
    });
  });

  describe('GET', () => {
    it('should return aggregated metrics', async () => {
      const response = await GET();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('bufferSize');
      expect(data).toHaveProperty('maxBufferSize');
      expect(data).toHaveProperty('pages');
      expect(typeof data.bufferSize).toBe('number');
      expect(typeof data.maxBufferSize).toBe('number');
    });

    it('should return percentile data for stored metrics', async () => {
      // First, add some metrics
      const metrics = [
        { name: 'LCP', value: 1000, rating: 'good' },
        { name: 'LCP', value: 2000, rating: 'good' },
        { name: 'LCP', value: 3000, rating: 'needs-improvement' },
        { name: 'LCP', value: 4000, rating: 'poor' },
      ];

      for (const metric of metrics) {
        const payload = {
          ...metric,
          delta: metric.value,
          id: `v3-test-${Math.random()}`,
          navigationType: 'navigate',
          page: '/test-page',
          timestamp: Date.now(),
        };

        const request = new NextRequest('http://localhost/api/telemetry/vitals', {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: {
            'Content-Type': 'application/json',
          },
        });

        await POST(request);
      }

      const response = await GET();
      const data = await response.json();

      expect(data.pages['/test-page']).toBeDefined();
      expect(data.pages['/test-page'].LCP).toBeDefined();
      expect(data.pages['/test-page'].LCP.p50).toBeDefined();
      expect(data.pages['/test-page'].LCP.p75).toBeDefined();
      expect(data.pages['/test-page'].LCP.p95).toBeDefined();
      expect(data.pages['/test-page'].LCP.ratings).toBeDefined();
    });
  });
});
