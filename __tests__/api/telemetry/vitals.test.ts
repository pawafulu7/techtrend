/**
 * Web Vitals Telemetry API Tests
 *
 * GET の管理者認証とレート制限は素通しにする。包み方は __tests__/api/auth-middleware-composition.test.ts、
 * 認証そのものは __tests__/lib/middleware/with-admin-auth.test.ts で確かめる。
 * POST は handler の中で IP をキーに数えるので、リミッターを差し替えてここで確かめる。
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  ...jest.requireActual('@/lib/middleware/with-rate-limit'),
  withRateLimit: (_key: string, handler: Function) => handler,
}));

jest.mock('@/lib/middleware/with-admin-auth', () => ({
  withAdminAuth: (handler: Function) => handler,
}));

jest.mock('@/lib/middleware/session-context', () => ({
  ...jest.requireActual('@/lib/middleware/session-context'),
  resolveSessionFromRequest: jest.fn(),
}));

const mockLimiter = { points: 60 };
jest.mock('@/lib/rate-limiter', () => ({
  ...jest.requireActual('@/lib/rate-limiter'),
  checkRateLimit: jest.fn(),
  createRateLimiterFromConfig: jest.fn(() => mockLimiter),
}));

import { GET, POST } from '@/app/api/telemetry/vitals/route';
import { resolveSessionFromRequest } from '@/lib/middleware/session-context';
import {
  checkRateLimit,
  createRateLimiterFromConfig,
  RateLimitError,
} from '@/lib/rate-limiter';

beforeEach(() => {
  (checkRateLimit as jest.Mock).mockReset().mockResolvedValue({
    limit: 60,
    remaining: 59,
    reset: new Date(),
  });
});

// jest は next/server をモック（__mocks__/next/server.ts）に差し替えていて、その NextRequest は
// 本文を文字列のまま持つ。POST は本文をストリームで上限まで読むので、本物の Request で作る
const URL_BASE = 'http://localhost/api/telemetry/vitals';

function postVital(payload: Record<string, unknown>) {
  return POST(
    new Request(URL_BASE, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

function getVitals() {
  return GET(new NextRequest(URL_BASE));
}

function vital(overrides: Record<string, unknown> = {}) {
  return {
    name: 'LCP',
    value: 2500,
    delta: 2500,
    id: `v6-${Math.random()}`,
    rating: 'good',
    navigationType: 'navigate',
    page: '/',
    timestamp: Date.now(),
    ...overrides,
  };
}

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

      const request = new Request(URL_BASE, {
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

        const request = new Request(URL_BASE, {
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

      const request = new Request(URL_BASE, {
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

      const request = new Request(URL_BASE, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('should reject a body that is not JSON with 400', async () => {
      const request = new Request(URL_BASE, {
        method: 'POST',
        body: '{not json',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('counts requests per client IP without looking up the session', async () => {
      const response = await POST(
        new Request(URL_BASE, {
          method: 'POST',
          body: JSON.stringify(vital()),
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': '203.0.113.5, 10.0.0.1',
          },
        })
      );
      expect(response.status).toBe(204);
      expect(createRateLimiterFromConfig).toHaveBeenCalledWith(
        'write:telemetry-vitals'
      );
      expect(checkRateLimit).toHaveBeenCalledWith(
        'ip:203.0.113.5',
        mockLimiter
      );
      expect(resolveSessionFromRequest).not.toHaveBeenCalled();
    });

    it('returns 429 when the IP is over the limit', async () => {
      (checkRateLimit as jest.Mock).mockRejectedValue(
        new RateLimitError(
          'Rate limit exceeded',
          60,
          0,
          new Date(Date.now() + 30_000)
        )
      );
      const response = await postVital(vital());
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBeTruthy();
    });

    it('rejects a body larger than 4KB with 413 before parsing it', async () => {
      const response = await postVital(vital({ ignored: 'x'.repeat(5000) }));
      expect(response.status).toBe(413);
    });

    it('rejects non-finite or negative numbers and an empty id', async () => {
      const body = JSON.stringify(vital()).replace(
        /"value":\d+/,
        '"value":1e400'
      );
      const infinite = await POST(
        new Request(URL_BASE, {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(infinite.status).toBe(400);
      expect((await postVital(vital({ value: -1 }))).status).toBe(400);
      expect((await postVital(vital({ timestamp: 1.5 }))).status).toBe(400);
      expect((await postVital(vital({ id: '' }))).status).toBe(400);
      // INP は送り直すと下がることがあるので、差分は負でも受ける
      expect((await postVital(vital({ delta: -10 }))).status).toBe(204);
    });

    it('should reject a page that is not a path', async () => {
      for (const page of [
        '__proto__',
        'constructor',
        'https://example.com/',
        '//evil.example',
        '/with space',
        '/control\u0000',
        '/bidi\u202e',
      ]) {
        const response = await postVital(vital({ page }));
        expect(response.status).toBe(400);
      }
    });

    it('should reject an id or page longer than the limit', async () => {
      expect((await postVital(vital({ id: 'x'.repeat(129) }))).status).toBe(
        400
      );
      expect(
        (await postVital(vital({ page: `/${'a'.repeat(2048)}` }))).status
      ).toBe(400);
      // 上限ちょうどは受ける
      expect((await postVital(vital({ id: 'x'.repeat(128) }))).status).toBe(
        204
      );
      expect(
        (await postVital(vital({ page: `/${'a'.repeat(2047)}` }))).status
      ).toBe(204);
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

        const request = new Request(URL_BASE, {
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
        'restore',
        'soft-navigation',
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

        const request = new Request(URL_BASE, {
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
      const response = await getVitals();
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

        const request = new Request(URL_BASE, {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: {
            'Content-Type': 'application/json',
          },
        });

        await POST(request);
      }

      const response = await getVitals();
      const data = await response.json();

      expect(data.pages['/test-page']).toBeDefined();
      expect(data.pages['/test-page'].LCP).toBeDefined();
      expect(data.pages['/test-page'].LCP.p50).toBeDefined();
      expect(data.pages['/test-page'].LCP.p75).toBeDefined();
      expect(data.pages['/test-page'].LCP.p95).toBeDefined();
      expect(data.pages['/test-page'].LCP.ratings).toBeDefined();
    });

    it('returns the summary with no-store', async () => {
      const response = await getVitals();
      expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    });

    it('keeps the newer value when an older report of the same metric arrives later', async () => {
      const base = { name: 'INP', id: 'v6-out-of-order', page: '/order-page' };
      await postVital(
        vital({
          ...base,
          value: 300,
          rating: 'needs-improvement',
          timestamp: 200,
        })
      );
      await postVital(
        vital({ ...base, value: 100, rating: 'good', timestamp: 100 })
      );

      const data = await (await getVitals()).json();
      expect(data.pages['/order-page'].INP.p50).toBe(300);
      expect(data.pages['/order-page'].INP.ratings).toEqual({
        good: 0,
        'needs-improvement': 1,
        poor: 0,
      });
    });

    it('should count a metric re-sent with the same id once, with the latest value', async () => {
      // CLS・INP はタブを隠すたびに同じ id で送り直される
      expect(
        (
          await postVital(
            vital({ name: 'CLS', id: 'v6-dup', value: 0.05, page: '/dup-page' })
          )
        ).status
      ).toBe(204);
      expect(
        (
          await postVital(
            vital({
              name: 'CLS',
              id: 'v6-dup',
              value: 0.3,
              rating: 'poor',
              page: '/dup-page',
            })
          )
        ).status
      ).toBe(204);

      const data = await (await getVitals()).json();
      expect(data.pages['/dup-page'].CLS).toEqual({
        p50: 0.3,
        p75: 0.3,
        p95: 0.3,
        ratings: { good: 0, 'needs-improvement': 0, poor: 1 },
      });
    });
  });
});
