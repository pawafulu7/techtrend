// Redisキャッシュのモック
export class RedisCache {
  static lastInstance: RedisCache | null = null;

  static reset() {
    RedisCache.lastInstance = null;
  }

  constructor(options?: any) {
    RedisCache.lastInstance = this;
  }

  generateCacheKey = jest.fn((base: string, _options?: any) => base);
  get = jest.fn().mockResolvedValue(null);
  set = jest.fn().mockResolvedValue(true);
  delete = jest.fn().mockResolvedValue(true);
  exists = jest.fn().mockResolvedValue(false);
  clear = jest.fn().mockResolvedValue(true);
  disconnect = jest.fn().mockResolvedValue(undefined);
}
