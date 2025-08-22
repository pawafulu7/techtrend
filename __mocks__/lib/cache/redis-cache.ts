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
  generateCacheKey: jest.fn((base: string, options?: any) => {
    let key = base;
    
    if (options?.prefix) {
      key = `${options.prefix}:${key}`;
    }
    
    if (options?.params) {
      const sortedParams = Object.entries(options.params)
        .filter(([_, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => {
          if (Array.isArray(v)) {
            return `${k}=${v.join(',')}`;
          }
          return `${k}=${v}`;
        })
        .join(':');
      if (sortedParams) {
        key = `${key}:${sortedParams}`;
      }
    }
    
    return key;
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