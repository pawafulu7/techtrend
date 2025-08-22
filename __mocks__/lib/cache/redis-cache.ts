/**
 * Mock for @/lib/cache/redis-cache
 */

export const cache = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  getOrSet: jest.fn(async (key: string, fetcher: () => Promise<any>, ttl?: number) => {
    const cached = await cache.get(key);
    if (cached) return cached;
    const value = await fetcher();
    await cache.set(key, value, ttl);
    return value;
  }),
  invalidate: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
  generateCacheKey: jest.fn((prefix: string, options?: any) => {
    const params = options?.params || {};
    return `${prefix}:${JSON.stringify(params)}`;
  }),
  getStats: jest.fn().mockReturnValue({
    hits: 0,
    misses: 0,
    errors: 0,
    sets: 0,
    invalidations: 0,
  }),
  resetStats: jest.fn(),
};

export class RedisCache {
  constructor(options?: any) {}
  
  get = cache.get;
  set = cache.set;
  getOrSet = cache.getOrSet;
  invalidate = cache.invalidate;
  clear = cache.clear;
  generateCacheKey = cache.generateCacheKey;
  getStats = cache.getStats;
  resetStats = cache.resetStats;
}