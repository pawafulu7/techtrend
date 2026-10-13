import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { RateLimitError } from '@/lib/rate-limiter';

// Mock dependencies (preserve RateLimitError class)
jest.mock('@/lib/auth/get-session');
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

import { getSession } from '@/lib/auth/get-session';
import {
  checkRateLimit,
  createRateLimiterFromConfig,
} from '@/lib/rate-limiter';
import { getRateLimitConfig } from '@/lib/config/rate-limits';

const mockAuth = getSession as jest.MockedFunction<typeof getSession>;

// withRateLimit は resolveSession → auth.api.getSession を呼ぶ
const getAuthApiGetSession = () => {
  const { auth } = require('@/lib/auth/auth');
  return auth.api.getSession as jest.Mock;
};
const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<
  typeof checkRateLimit
>;
const mockGetRateLimitConfig = getRateLimitConfig as jest.MockedFunction<
  typeof getRateLimitConfig
>;
const mockCreateRateLimiterFromConfig =
  createRateLimiterFromConfig as jest.MockedFunction<
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

    // デフォルトは未認証（resolveSession → auth.api.getSession を使う）
    getAuthApiGetSession().mockResolvedValue(null);
  });

  describe('Success Cases', () => {
    it('should allow requests within limit', async () => {
      getAuthApiGetSession().mockResolvedValue(null);
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
      expect(response.headers.get('X-RateLimit-Reset')).toBe(
        '2025-11-03T10:00:00.000Z'
      );
    });

    it('should call onAllowed callback when provided', async () => {
      getAuthApiGetSession().mockResolvedValue(null);
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
      getAuthApiGetSession().mockResolvedValue(null);

      const resetDate = new Date(Date.now() + 60_000); // 60 seconds in the future
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
      expect(body.limit).toBe(10);

      expect(response.headers.get('Retry-After')).toBeTruthy();
      expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    });

    it('should call onBlocked callback when provided', async () => {
      getAuthApiGetSession().mockResolvedValue(null);

      const resetDate = new Date();
      const rateLimitError = new RateLimitError(
        'Rate limit exceeded',
        10,
        0,
        resetDate
      );
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
      getAuthApiGetSession().mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
      });

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

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        'user:user123',
        mockLimiter
      );
    });

    it('should fallback to IP when user strategy but no session', async () => {
      getAuthApiGetSession().mockResolvedValue(null);

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

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        'anon:192.168.1.1',
        mockLimiter
      );
    });

    it('should use IP when ip strategy', async () => {
      getAuthApiGetSession().mockResolvedValue(null);

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

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        'ip:10.0.0.1',
        mockLimiter
      );
    });

    it('does not put the raw IP into the span event', async () => {
      const { trace } = jest.requireMock('@opentelemetry/api');
      const addEvent = jest.fn();
      (trace.getActiveSpan as jest.Mock).mockReturnValue({ addEvent });

      mockCheckRateLimit.mockResolvedValue({
        limit: 10,
        remaining: 9,
        reset: new Date(),
      });

      const handler = withRateLimit('test:policy', async () => {
        return NextResponse.json({ success: true });
      });
      await handler(
        new NextRequest('http://localhost/api/test', {
          headers: { 'x-forwarded-for': '203.0.113.7' },
        })
      );

      // limitKey（ip:<IP>）は載せない。短いハッシュでは IPv4 を総当たりで戻せるため
      expect(addEvent).toHaveBeenCalledWith('ratelimit.allowed', {
        configKey: 'test:policy',
        keyStrategy: 'ip',
        remaining: 9,
      });
      expect(JSON.stringify(addEvent.mock.calls)).not.toContain('203.0.113.7');

      (trace.getActiveSpan as jest.Mock).mockReturnValue(undefined);
    });

    it('keeps the rate limit headers that the handler already set', async () => {
      mockCheckRateLimit.mockResolvedValue({
        limit: 5,
        remaining: 4,
        reset: new Date('2026-10-12T01:00:00Z'),
      });

      // handler の中で別の制限（全体の上限）に当たって 429 を返した場合
      const handler = withRateLimit('test:policy', async () =>
        NextResponse.json(
          { error: 'rate_limited' },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': '50',
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': '2026-10-12T02:00:00.000Z',
            },
          }
        )
      );
      const response = await handler(
        new NextRequest('http://localhost/api/test', {
          headers: { 'x-forwarded-for': '203.0.113.8' },
        })
      );

      expect(response.headers.get('X-RateLimit-Limit')).toBe('50');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(response.headers.get('X-RateLimit-Reset')).toBe(
        '2026-10-12T02:00:00.000Z'
      );
    });

    it('should use anonymous when anonymous strategy', async () => {
      getAuthApiGetSession().mockResolvedValue(null);

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
      getAuthApiGetSession().mockResolvedValue(session);

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
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        'custom:key123',
        mockLimiter
      );
    });
  });

  describe('Error Handling', () => {
    it('should propagate non-RateLimitError errors', async () => {
      getAuthApiGetSession().mockResolvedValue(null);
      mockCheckRateLimit.mockRejectedValue(
        new Error('Redis connection failed')
      );

      const handler = withRateLimit('test:policy', async () => {
        return NextResponse.json({ success: true });
      });

      const request = new NextRequest('http://localhost/api/test');

      await expect(handler(request)).rejects.toThrow('Redis connection failed');
    });

    it('allowOnLimiterError: 制限の確認が失敗したら、制限のヘッダーを付けずに handler を通す', async () => {
      const session = { user: { id: 'admin-1' } };
      mockCheckRateLimit.mockRejectedValue(
        new Error('Rate limit check failed: Connection is closed.')
      );
      const inner = jest.fn(async () => NextResponse.json({ success: true }));

      const handler = withRateLimit('test:policy', inner, {
        allowOnLimiterError: true,
      });
      const response = await handler(
        new NextRequest('http://localhost/api/test'),
        { session }
      );

      expect(response.status).toBe(200);
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
      expect(inner).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ session })
      );
      expect(response.headers.has('X-RateLimit-Limit')).toBe(false);
    });

    it('allowOnLimiterError: 制限を超えたときは handler を通さずに 429 を返す', async () => {
      mockCheckRateLimit.mockRejectedValue(
        new RateLimitError(
          'Rate limit exceeded',
          10,
          0,
          new Date(Date.now() + 30000)
        )
      );
      const inner = jest.fn(async () => NextResponse.json({ success: true }));

      const handler = withRateLimit('test:policy', inner, {
        allowOnLimiterError: true,
      });
      const response = await handler(
        new NextRequest('http://localhost/api/test')
      );

      expect(response.status).toBe(429);
      expect(inner).not.toHaveBeenCalled();
    });

    it('allowOnLimiterError: handler の例外は握りつぶさずに投げる', async () => {
      mockCheckRateLimit.mockResolvedValue({
        limit: 10,
        remaining: 9,
        reset: new Date(),
      });

      const handler = withRateLimit(
        'test:policy',
        async () => {
          throw new Error('handler failed');
        },
        { allowOnLimiterError: true }
      );

      await expect(
        handler(new NextRequest('http://localhost/api/test'))
      ).rejects.toThrow('handler failed');
    });

    it('should calculate retryAfter correctly', async () => {
      getAuthApiGetSession().mockResolvedValue(null);

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
    it('does not look up the session when resolveSession is false', async () => {
      getAuthApiGetSession().mockResolvedValue({ user: { id: 'user123' } });
      mockCheckRateLimit.mockResolvedValue({
        limit: 10,
        remaining: 9,
        reset: new Date(),
      });
      const inner = jest.fn(async () => NextResponse.json({ success: true }));

      const handler = withRateLimit('test:policy', inner, {
        resolveSession: false,
      });
      const response = await handler(
        new NextRequest('http://localhost/api/test', {
          headers: { 'x-forwarded-for': '10.0.0.2' },
        })
      );

      expect(response.status).toBe(200);
      expect(getAuthApiGetSession()).not.toHaveBeenCalled();
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        'ip:10.0.0.2',
        mockLimiter
      );
      expect(inner).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ session: undefined })
      );
      // 制限のヘッダーは引くときと同じく付く
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('9');
    });

    it('should fetch session only once', async () => {
      getAuthApiGetSession().mockResolvedValue({
        user: { id: 'user123' },
      });

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

      // Verify auth.api.getSession called exactly once
      expect(getAuthApiGetSession()).toHaveBeenCalledTimes(1);
    });
  });
});
