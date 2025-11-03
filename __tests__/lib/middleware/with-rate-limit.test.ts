import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { RateLimitError } from '@/lib/rate-limiter';

// Mock dependencies (preserve RateLimitError class)
jest.mock('@/lib/auth/auth');
jest.mock('@/lib/rate-limiter', () => {
  const actual = jest.requireActual('@/lib/rate-limiter');
  return {
    ...actual,
    checkRateLimit: jest.fn(),
    createRateLimiterFromConfig: jest.fn(),
  };
});
jest.mock('@/lib/config/rate-limits');
jest.mock('@opentelemetry/api');

import { auth } from '@/lib/auth/auth';
import { checkRateLimit, createRateLimiterFromConfig } from '@/lib/rate-limiter';
import { getRateLimitConfig } from '@/lib/config/rate-limits';

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;
const mockGetRateLimitConfig = getRateLimitConfig as jest.MockedFunction<typeof getRateLimitConfig>;
const mockCreateRateLimiterFromConfig = createRateLimiterFromConfig as jest.MockedFunction<
  typeof createRateLimiterFromConfig
>;

describe('withRateLimit', () => {
  const mockLimiter = {} as any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetRateLimitConfig.mockReturnValue({
      points: 10,
      duration: 60,
      blockDuration: 0,
      keyStrategy: 'ip',
      notes: 'Test policy',
    });

    mockCreateRateLimiterFromConfig.mockReturnValue(mockLimiter);
  });

  describe('Success Cases', () => {
    it('should allow requests within limit', async () => {
      mockAuth.mockResolvedValue(null);
      mockCheckRateLimit.mockResolvedValue({
        limit: 10,
        remaining: 9,
        reset: new Date('2025-11-03T10:00:00Z'),
      });

      const handler = withRateLimit('test:policy', async (request) => {
        return NextResponse.json({ success: true });
      });

      const request = new NextRequest('http://localhost/api/test', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      const response = await handler(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('9');
      expect(response.headers.get('X-RateLimit-Reset')).toBe('2025-11-03T10:00:00.000Z');
    });

    it('should call onAllowed callback when provided', async () => {
      mockAuth.mockResolvedValue(null);
      mockCheckRateLimit.mockResolvedValue({
        limit: 10,
        remaining: 5,
        reset: new Date(),
      });

      const onAllowed = jest.fn();
      const handler = withRateLimit(
        'test:policy',
        async () => NextResponse.json({ success: true }),
        { onAllowed }
      );

      const request = new NextRequest('http://localhost/api/test');
      await handler(request);

      expect(onAllowed).toHaveBeenCalledWith({
        limit: 10,
        remaining: 5,
        reset: expect.any(Date),
      });
    });
  });

  describe('Rate Limit Exceeded', () => {
    it('should return 429 when rate limit exceeded', async () => {
      mockAuth.mockResolvedValue(null);

      // Use dynamic future date to avoid time-dependent test failures
      const resetDate = new Date(Date.now() + 60000); // 60 seconds from now
      mockCheckRateLimit.mockRejectedValue(
        new RateLimitError('Rate limit exceeded', 10, 0, resetDate)
      );

      const handler = withRateLimit('test:policy', async () => {
        return NextResponse.json({ success: true });
      });

      const request = new NextRequest('http://localhost/api/test');
      const response = await handler(request);

      expect(response.status).toBe(429);

      const body = await response.json();
      expect(body.error).toBe('rate_limited');
      expect(body.retryAfter).toBeGreaterThan(0);
      expect(body.retryAfter).toBeLessThanOrEqual(60); // Should be within 60 seconds
      expect(body.limit).toBe(10);

      expect(response.headers.get('Retry-After')).toBeTruthy();
      expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    });

    it('should call onBlocked callback when provided', async () => {
      mockAuth.mockResolvedValue(null);

      const resetDate = new Date();
      const rateLimitError = new RateLimitError('Rate limit exceeded', 10, 0, resetDate);
      mockCheckRateLimit.mockRejectedValue(rateLimitError);

      const onBlocked = jest.fn();
      const handler = withRateLimit(
        'test:policy',
        async () => NextResponse.json({ success: true }),
        { onBlocked }
      );

      const request = new NextRequest('http://localhost/api/test');
      await handler(request);

      expect(onBlocked).toHaveBeenCalledWith(rateLimitError);
    });
  });

  describe('Key Resolution', () => {
    it('should use user ID when user strategy and session exists', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
      } as any);

      mockGetRateLimitConfig.mockReturnValue({
        points: 10,
        duration: 60,
        blockDuration: 0,
        keyStrategy: 'user',
      });

      mockCheckRateLimit.mockResolvedValue({
        limit: 10,
        remaining: 9,
        reset: new Date(),
      });

      const handler = withRateLimit('test:policy', async () => {
        return NextResponse.json({ success: true });
      });

      const request = new NextRequest('http://localhost/api/test');
      await handler(request);

      expect(mockCheckRateLimit).toHaveBeenCalledWith('user:user123', mockLimiter);
    });

    it('should fallback to IP when user strategy but no session', async () => {
      mockAuth.mockResolvedValue(null);

      mockGetRateLimitConfig.mockReturnValue({
        points: 10,
        duration: 60,
        blockDuration: 0,
        keyStrategy: 'user',
      });

      mockCheckRateLimit.mockResolvedValue({
        limit: 10,
        remaining: 9,
        reset: new Date(),
      });

      const handler = withRateLimit('test:policy', async () => {
        return NextResponse.json({ success: true });
      });

      const request = new NextRequest('http://localhost/api/test', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });
      await handler(request);

      expect(mockCheckRateLimit).toHaveBeenCalledWith('anon:192.168.1.1', mockLimiter);
    });

    it('should use IP when ip strategy', async () => {
      mockAuth.mockResolvedValue(null);

      mockGetRateLimitConfig.mockReturnValue({
        points: 10,
        duration: 60,
        blockDuration: 0,
        keyStrategy: 'ip',
      });

      mockCheckRateLimit.mockResolvedValue({
        limit: 10,
        remaining: 9,
        reset: new Date(),
      });

      const handler = withRateLimit('test:policy', async () => {
        return NextResponse.json({ success: true });
      });

      const request = new NextRequest('http://localhost/api/test', {
        headers: { 'x-forwarded-for': '10.0.0.1' },
      });
      await handler(request);

      expect(mockCheckRateLimit).toHaveBeenCalledWith('ip:10.0.0.1', mockLimiter);
    });

    it('should use anonymous when anonymous strategy', async () => {
      mockAuth.mockResolvedValue(null);

      mockGetRateLimitConfig.mockReturnValue({
        points: 500,
        duration: 60,
        blockDuration: 0,
        keyStrategy: 'anonymous',
      });

      mockCheckRateLimit.mockResolvedValue({
        limit: 500,
        remaining: 499,
        reset: new Date(),
      });

      const handler = withRateLimit('public:health', async () => {
        return NextResponse.json({ status: 'ok' });
      });

      const request = new NextRequest('http://localhost/api/health');
      await handler(request);

      expect(mockCheckRateLimit).toHaveBeenCalledWith('anonymous', mockLimiter);
    });

    it('should use custom keyResolver when provided', async () => {
      const session = { user: { id: 'user123', email: 'test@example.com' } };
      mockAuth.mockResolvedValue(session as any);

      mockCheckRateLimit.mockResolvedValue({
        limit: 10,
        remaining: 9,
        reset: new Date(),
      });

      const customKeyResolver = jest.fn().mockResolvedValue('custom:key123');

      const handler = withRateLimit(
        'test:policy',
        async () => NextResponse.json({ success: true }),
        { keyResolver: customKeyResolver }
      );

      const request = new NextRequest('http://localhost/api/test');
      await handler(request);

      expect(customKeyResolver).toHaveBeenCalledWith(request, session);
      expect(mockCheckRateLimit).toHaveBeenCalledWith('custom:key123', mockLimiter);
    });
  });

  describe('Error Handling', () => {
    it('should propagate non-RateLimitError errors', async () => {
      mockAuth.mockResolvedValue(null);
      mockCheckRateLimit.mockRejectedValue(new Error('Redis connection failed'));

      const handler = withRateLimit('test:policy', async () => {
        return NextResponse.json({ success: true });
      });

      const request = new NextRequest('http://localhost/api/test');

      await expect(handler(request)).rejects.toThrow('Redis connection failed');
    });

    it('should calculate retryAfter correctly', async () => {
      mockAuth.mockResolvedValue(null);

      const resetDate = new Date(Date.now() + 45000); // 45 seconds from now
      mockCheckRateLimit.mockRejectedValue(
        new RateLimitError('Rate limit exceeded', 10, 0, resetDate)
      );

      const handler = withRateLimit('test:policy', async () => {
        return NextResponse.json({ success: true });
      });

      const request = new NextRequest('http://localhost/api/test');
      const response = await handler(request);

      const retryAfter = response.headers.get('Retry-After');
      expect(parseInt(retryAfter!)).toBeGreaterThan(40);
      expect(parseInt(retryAfter!)).toBeLessThanOrEqual(45);
    });
  });

  describe('Session Handling', () => {
    it('should fetch session only once', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user123' },
      } as any);

      mockGetRateLimitConfig.mockReturnValue({
        points: 10,
        duration: 60,
        blockDuration: 0,
        keyStrategy: 'user',
      });

      mockCheckRateLimit.mockResolvedValue({
        limit: 10,
        remaining: 9,
        reset: new Date(),
      });

      const handler = withRateLimit('test:policy', async () => {
        return NextResponse.json({ success: true });
      });

      const request = new NextRequest('http://localhost/api/test');
      await handler(request);

      // Verify auth() called exactly once
      expect(mockAuth).toHaveBeenCalledTimes(1);
    });
  });
});
