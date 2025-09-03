/**
 * Mock for @/lib/cache
 */

export class RedisCache {
  get = jest.fn().mockResolvedValue(null);
  set = jest.fn().mockResolvedValue(undefined);
  invalidate = jest.fn().mockResolvedValue(undefined);
  generateCacheKey = jest.fn().mockImplementation((base: string, params: any) => {
    if (!params) return base;
    const sortedParams = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(':');
    return sortedParams ? `${base}:${sortedParams}` : base;
  });
  
  constructor(options?: any) {
    // Mock constructor
  }
}