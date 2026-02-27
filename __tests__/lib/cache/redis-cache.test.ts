/**
 * RedisCache.getOrSetWithLock テスト
 * atomic lock release（Luaスクリプト）の検証
 */

import { RedisCache } from '@/lib/cache/redis-cache';

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  hashSensitiveValue: jest.fn((v: string) => `hashed:${v}`),
}));

// evalメソッドを含むモックRedis
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  eval: jest.fn(),
  exists: jest.fn(),
  ttl: jest.fn(),
};

describe('RedisCache.getOrSetWithLock', () => {
  let cache: RedisCache;

  beforeEach(() => {
    jest.useFakeTimers();
    Object.values(mockRedis).forEach((fn) => {
      (fn as jest.Mock).mockReset();
    });
    cache = new RedisCache({ namespace: 'test' });
    // privateフィールドを直接差し替え
    (cache as any).redis = mockRedis;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('basic flow', () => {
    it('cache miss -> lock -> fetch -> cache -> return', async () => {
      // cache miss
      mockRedis.get.mockResolvedValue(null);
      // lock acquired
      mockRedis.set.mockResolvedValue('OK');
      // setex for caching
      mockRedis.setex.mockResolvedValue('OK');
      // eval for lock release
      mockRedis.eval.mockResolvedValue(1);

      const fetcher = jest.fn().mockResolvedValue({ data: 'fresh' });
      const result = await cache.getOrSetWithLock('test-key', fetcher, 60);

      expect(result).toEqual({ data: 'fresh' });
      expect(fetcher).toHaveBeenCalledTimes(1);
      // setex called to cache the result
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'test:test-key',
        60,
        JSON.stringify({ data: 'fresh' })
      );
      // eval called for atomic lock release (not del)
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('cache hit returns cached value without locking', async () => {
      // cache hit
      mockRedis.get.mockResolvedValue(JSON.stringify({ data: 'cached' }));

      const fetcher = jest.fn();
      const result = await cache.getOrSetWithLock('test-key', fetcher);

      expect(result).toEqual({ data: 'cached' });
      expect(fetcher).not.toHaveBeenCalled();
      // No lock attempt
      expect(mockRedis.set).not.toHaveBeenCalled();
      expect(mockRedis.eval).not.toHaveBeenCalled();
    });
  });

  describe('atomic lock release', () => {
    it('uses unique token in SET NX EX call (not fixed value)', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const fetcher = jest.fn().mockResolvedValue('data');
      await cache.getOrSetWithLock('key1', fetcher);

      // set was called with a token (not '1')
      const setCall = mockRedis.set.mock.calls[0];
      expect(setCall[0]).toContain(':key1:lock'); // fullLockKey
      const token = setCall[1];
      expect(token).not.toBe('1');
      expect(token).toMatch(/^\d+_[a-z0-9]+$/); // Date.now()_random pattern

      // eval was called with the same token
      const evalCall = mockRedis.eval.mock.calls[0];
      expect(evalCall[0]).toContain('redis.call("get", KEYS[1])');
      expect(evalCall[1]).toBe(1); // numKeys
      expect(evalCall[2]).toContain(':key1:lock'); // fullLockKey
      expect(evalCall[3]).toBe(token); // same token
    });

    it('token mismatch: eval returns 0 (lock preserved for other process)', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.setex.mockResolvedValue('OK');
      // Simulate token mismatch - eval returns 0
      mockRedis.eval.mockResolvedValue(0);

      const fetcher = jest.fn().mockResolvedValue('data');
      const result = await cache.getOrSetWithLock('key1', fetcher);

      // Method still returns successfully even if lock release "fails" (token mismatch)
      expect(result).toBe('data');
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);
      // del should NOT be called (atomic release only)
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('eval error is caught and logged without throwing', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.eval.mockRejectedValue(new Error('Redis eval error'));

      const fetcher = jest.fn().mockResolvedValue('data');
      const result = await cache.getOrSetWithLock('key1', fetcher);

      // Method still returns successfully
      expect(result).toBe('data');
    });
  });

  describe('NX semantics', () => {
    it('second lock attempt returns null when lock exists', async () => {
      // First call: cache miss, lock acquired
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set
        .mockResolvedValueOnce('OK') // first lock attempt succeeds
        .mockResolvedValueOnce(null); // second lock attempt fails (NX)

      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);

      const fetcher = jest.fn().mockResolvedValue('data');
      await cache.getOrSetWithLock('key1', fetcher);

      // Verify first set had NX
      expect(mockRedis.set.mock.calls[0][4]).toBe('NX');
    });
  });

  describe('lock wait + polling', () => {
    it('when lock held by another, polls until data appears', async () => {
      let getCalls = 0;
      mockRedis.get.mockImplementation(async (key: string) => {
        getCalls++;
        // First call: cache miss (triggers lock attempt)
        // Second call: still miss (polling)
        // Third call: data appears (another process cached it)
        if (getCalls <= 2) return null;
        if (key.includes(':lock')) return null;
        return JSON.stringify({ data: 'from-other-process' });
      });
      // Lock NOT acquired (another process holds it)
      mockRedis.set.mockResolvedValue(null);

      const fetcher = jest.fn().mockResolvedValue('fallback');

      // Run the getOrSetWithLock call
      const resultPromise = cache.getOrSetWithLock('key1', fetcher);

      // Advance timers to allow polling
      await jest.advanceTimersByTimeAsync(200);

      const result = await resultPromise;

      expect(result).toEqual({ data: 'from-other-process' });
      // fetcher should NOT have been called (data found via polling)
      expect(fetcher).not.toHaveBeenCalled();
    });
  });

  describe('lock timeout fallback', () => {
    it('when lock held and data never appears, falls back to fetcher', async () => {
      // Always return null for cache (never populated)
      mockRedis.get.mockResolvedValue(null);
      // Lock NOT acquired
      mockRedis.set.mockResolvedValue(null);

      const fetcher = jest.fn().mockResolvedValue({ data: 'fallback' });

      const resultPromise = cache.getOrSetWithLock('key1', fetcher);

      // Advance past maxWaitTime (5000ms)
      await jest.advanceTimersByTimeAsync(6000);

      const result = await resultPromise;

      expect(result).toEqual({ data: 'fallback' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  describe('log sanitization', () => {
    it('uses hashSensitiveValue for key in timeout log', async () => {
      const { default: logger, hashSensitiveValue } =
        jest.requireMock('@/lib/logger');

      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue(null);

      const fetcher = jest.fn().mockResolvedValue('data');

      const resultPromise = cache.getOrSetWithLock('sensitive-key', fetcher);
      await jest.advanceTimersByTimeAsync(6000);
      await resultPromise;

      // hashSensitiveValue should have been called with the key
      expect(hashSensitiveValue).toHaveBeenCalledWith('sensitive-key');
      // logger.warn should use the hashed value, not the plain key
      const warnCalls = logger.warn.mock.calls;
      const timeoutWarn = warnCalls.find(
        (call: unknown[]) =>
          typeof call[1] === 'string' && call[1].includes('Lock wait timeout')
      );
      expect(timeoutWarn).toBeDefined();
      expect(timeoutWarn[0].key).toBe('hashed:sensitive-key');
    });

    it('uses hashSensitiveValue for key in error fallback log', async () => {
      // Use real timers for this test (no polling involved - error triggers outer catch)
      jest.useRealTimers();

      const { default: logger, hashSensitiveValue } =
        jest.requireMock('@/lib/logger');

      // get returns null (cache miss), then set throws to trigger outer catch
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockRejectedValue(new Error('Redis down'));

      const fetcher = jest.fn().mockResolvedValue('fallback');

      const result = await cache.getOrSetWithLock('secret-key', fetcher);

      expect(result).toBe('fallback');
      expect(hashSensitiveValue).toHaveBeenCalledWith('secret-key');
      const errorWarn = logger.warn.mock.calls.find(
        (call: unknown[]) =>
          typeof call[1] === 'string' &&
          call[1].includes('getOrSetWithLock error')
      );
      expect(errorWarn).toBeDefined();
      expect(errorWarn[0].key).toBe('hashed:secret-key');
    });
  });
});
