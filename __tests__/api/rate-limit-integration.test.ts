import { NextRequest } from 'next/server';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { createRateLimiterFromConfig } from '@/lib/rate-limiter';
import { getRateLimitConfig } from '@/lib/config/rate-limits';

// Mock auth
jest.mock('@/lib/auth/auth', () => ({
  auth: jest.fn().mockResolvedValue(null),
}));

// Import after mock
import { auth } from '@/lib/auth/auth';
const mockAuth = auth as jest.MockedFunction<typeof auth>;

describe('Rate Limiting Integration Tests', () => {
  describe('Config-driven rate limiting', () => {
    it('should create limiter from config', () => {
      const limiter = createRateLimiterFromConfig('auth:login');
      expect(limiter).toBeDefined();
      expect(limiter.points).toBe(5); // from config
    });

    it('should memoize limiter instances', () => {
      const limiter1 = createRateLimiterFromConfig('auth:login');
      const limiter2 = createRateLimiterFromConfig('auth:login');
      expect(limiter1).toBe(limiter2); // Same instance
    });

    it('should create different instances for different keys', () => {
      const limiter1 = createRateLimiterFromConfig('auth:login');
      const limiter2 = createRateLimiterFromConfig('auth:register');
      expect(limiter1).not.toBe(limiter2);
    });
  });

  describe('Multi-endpoint rate limiting', () => {
    it('should enforce limits independently across different endpoints', async () => {
      const handler1 = withRateLimit('auth:login', async () => {
        return new Response(JSON.stringify({ endpoint: 'login' }));
      });

      const handler2 = withRateLimit('auth:register', async () => {
        return new Response(JSON.stringify({ endpoint: 'register' }));
      });

      const request = new NextRequest('http://localhost/api/test', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      // Both should succeed (different limiters)
      const response1 = await handler1(request);
      const response2 = await handler2(request);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });
  });

  describe('User vs IP scoping', () => {
    it('should use user ID when authenticated', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
      } as any);

      const config = getRateLimitConfig('ai:summary');
      expect(config.keyStrategy).toBe('user');

      // User-scoped limiters should use user ID
      const limiter = createRateLimiterFromConfig('ai:summary');
      expect(limiter).toBeDefined();
    });

    it('should fallback to IP when anonymous', async () => {
      mockAuth.mockResolvedValue(null);

      const config = getRateLimitConfig('read:articles');
      expect(config.keyStrategy).toBe('ip');

      // IP-scoped limiters should use IP
      const limiter = createRateLimiterFromConfig('read:articles');
      expect(limiter).toBeDefined();
    });
  });

  describe('Error response standardization', () => {
    it('should return standardized 429 response structure', async () => {
      // Create a very strict limiter for testing
      const strictHandler = withRateLimit('auth:login', async () => {
        return new Response(JSON.stringify({ success: true }));
      });

      const request = new NextRequest('http://localhost/api/test', {
        headers: { 'x-forwarded-for': '192.168.1.100' },
      });

      // Exhaust the limit (5 requests for auth:login)
      for (let i = 0; i < 5; i++) {
        await strictHandler(request);
      }

      // 6th request should be rate limited
      const blockedResponse = await strictHandler(request);

      expect(blockedResponse.status).toBe(429);

      const body = await blockedResponse.json();
      expect(body).toMatchObject({
        error: 'rate_limited',
        message: expect.any(String),
        retryAfter: expect.any(Number),
        limit: 5,
        reset: expect.any(String),
      });

      // Check headers
      expect(blockedResponse.headers.get('Retry-After')).toBeTruthy();
      expect(blockedResponse.headers.get('X-RateLimit-Limit')).toBe('5');
      expect(blockedResponse.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(blockedResponse.headers.get('X-RateLimit-Reset')).toBeTruthy();
    });
  });

  describe('Rate limit headers on success', () => {
    it('should include rate limit headers on successful requests', async () => {
      mockAuth.mockResolvedValue(null);

      const handler = withRateLimit('public:health', async () => {
        return new Response(JSON.stringify({ status: 'ok' }));
      });

      const request = new NextRequest('http://localhost/api/health');
      const response = await handler(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('X-RateLimit-Limit')).toBeTruthy();
      expect(response.headers.get('X-RateLimit-Remaining')).toBeTruthy();
      expect(response.headers.get('X-RateLimit-Reset')).toBeTruthy();
    });
  });

  describe('Config validation', () => {
    it('should have valid auth configs', () => {
      const authLogin = getRateLimitConfig('auth:login');
      expect(authLogin.points).toBe(5);
      expect(authLogin.duration).toBe(60);
      expect(authLogin.keyStrategy).toBe('ip');
    });

    it('should have valid AI configs', () => {
      const aiSummary = getRateLimitConfig('ai:summary');
      expect(aiSummary.points).toBe(10);
      expect(aiSummary.duration).toBe(60);
      expect(aiSummary.keyStrategy).toBe('user');
    });

    it('should fallback to default for unknown keys', () => {
      const unknown = getRateLimitConfig('unknown:endpoint');
      expect(unknown.points).toBe(100);
      expect(unknown.keyStrategy).toBe('ip');
    });
  });
});
