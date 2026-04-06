// Redisキャッシュのモック
export class RedisCache {
  constructor(options?: any) {
    // コンストラクタパラメータは無視
  }

  get = jest.fn().mockResolvedValue(null);
  set = jest.fn().mockResolvedValue(true);
  delete = jest.fn().mockResolvedValue(true);
  exists = jest.fn().mockResolvedValue(false);
  clear = jest.fn().mockResolvedValue(true);
  disconnect = jest.fn().mockResolvedValue(undefined);
  // Non-async pass-through stub. NOT jest.fn() to survive clearAllMocks between tests.
  getOrSetWithLock<T>(_key: string, fetcher: () => Promise<T>): Promise<T> {
    return fetcher();
  }
  invalidatePattern(_pattern: string): Promise<void> {
    return Promise.resolve();
  }
}
