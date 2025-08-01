import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

// Upstash Redisのモック
jest.mock('@/lib/rate-limiter', () => ({
  rateLimiter: {
    limit: jest.fn(),
  },
  searchRateLimiter: {
    limit: jest.fn(),
  },
  aiRateLimiter: {
    limit: jest.fn(),
  },
}));

import { rateLimiter, searchRateLimiter, aiRateLimiter } from '@/lib/rate-limiter';

describe('Rate Limiting Middleware', () => {
  const mockRateLimiter = rateLimiter as jest.Mocked<typeof rateLimiter>;
  const mockSearchRateLimiter = searchRateLimiter as jest.Mocked<typeof searchRateLimiter>;
  const mockAiRateLimiter = aiRateLimiter as jest.Mocked<typeof aiRateLimiter>;

  beforeEach(() => {
    jest.clearAllMocks();
    // 環境変数を設定
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  describe('General API endpoints', () => {
    it('should allow requests when under rate limit', async () => {
      mockRateLimiter.limit.mockResolvedValue({
        success: true,
        limit: 100,
        reset: Date.now() + 60000,
        remaining: 99,
      });

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await middleware(request);

      expect(response.status).toBe(200); // NextResponse.next()は200を返す
      expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('99');
    });

    it('should block requests when rate limit exceeded', async () => {
      const resetTime = Date.now() + 30000;
      mockRateLimiter.limit.mockResolvedValue({
        success: false,
        limit: 100,
        reset: resetTime,
        remaining: 0,
      });

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await middleware(request);

      expect(response.status).toBe(429);
      
      const body = await response.json();
      expect(body.error).toBe('Too many requests');
      expect(body.message).toBe('Please try again later');
      
      expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(response.headers.get('Retry-After')).toBeDefined();
    });
  });

  describe('Search API endpoints', () => {
    it('should use search rate limiter for search endpoints', async () => {
      mockSearchRateLimiter.limit.mockResolvedValue({
        success: true,
        limit: 30,
        reset: Date.now() + 60000,
        remaining: 29,
      });

      const request = new NextRequest('http://localhost:3000/api/articles/search');
      await middleware(request);

      expect(mockSearchRateLimiter.limit).toHaveBeenCalled();
      expect(mockRateLimiter.limit).not.toHaveBeenCalled();
    });

    it('should handle advanced search endpoint', async () => {
      mockSearchRateLimiter.limit.mockResolvedValue({
        success: true,
        limit: 30,
        reset: Date.now() + 60000,
        remaining: 29,
      });

      const request = new NextRequest('http://localhost:3000/api/search/advanced');
      await middleware(request);

      expect(mockSearchRateLimiter.limit).toHaveBeenCalled();
    });
  });

  describe('AI API endpoints', () => {
    it('should use AI rate limiter for AI endpoints', async () => {
      mockAiRateLimiter.limit.mockResolvedValue({
        success: true,
        limit: 10,
        reset: Date.now() + 3600000,
        remaining: 9,
      });

      const request = new NextRequest('http://localhost:3000/api/ai/summarize');
      await middleware(request);

      expect(mockAiRateLimiter.limit).toHaveBeenCalled();
      expect(mockRateLimiter.limit).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should pass through requests when Redis is not configured', async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(mockRateLimiter.limit).not.toHaveBeenCalled();
    });

    it('should pass through requests when rate limiter throws error', async () => {
      mockRateLimiter.limit.mockRejectedValue(new Error('Redis connection failed'));

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await middleware(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Non-API routes', () => {
    it('should skip rate limiting for non-API routes', async () => {
      const request = new NextRequest('http://localhost:3000/');
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(mockRateLimiter.limit).not.toHaveBeenCalled();
    });

    it('should skip rate limiting for static assets', async () => {
      const request = new NextRequest('http://localhost:3000/_next/static/chunk.js');
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(mockRateLimiter.limit).not.toHaveBeenCalled();
    });
  });

  describe('IP detection', () => {
    it('should use request IP when available', async () => {
      mockRateLimiter.limit.mockResolvedValue({
        success: true,
        limit: 100,
        reset: Date.now() + 60000,
        remaining: 99,
      });

      const request = new NextRequest('http://localhost:3000/api/articles');
      Object.defineProperty(request, 'ip', {
        value: '192.168.1.1',
        writable: false,
      });

      await middleware(request);

      expect(mockRateLimiter.limit).toHaveBeenCalledWith('192.168.1.1');
    });

    it('should use anonymous when IP is not available', async () => {
      mockRateLimiter.limit.mockResolvedValue({
        success: true,
        limit: 100,
        reset: Date.now() + 60000,
        remaining: 99,
      });

      const request = new NextRequest('http://localhost:3000/api/articles');
      await middleware(request);

      expect(mockRateLimiter.limit).toHaveBeenCalledWith('anonymous');
    });
  });
});