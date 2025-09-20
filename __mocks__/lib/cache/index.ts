/**
 * Mock for @/lib/cache
 */

export const RedisCache = jest.fn().mockImplementation((options?: { namespace?: string }) => {
  const namespace = options?.namespace ?? 'test';
  const store = new Map<string, unknown>();

  const fullKey = (key: string) => `${namespace}:${key}`;

  const cacheApi = {
    get: jest.fn(async (key: string) => (store.has(fullKey(key)) ? store.get(fullKey(key)) : null)),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(fullKey(key), value);
    }),
    delete: jest.fn(async (key: string) => {
      store.delete(fullKey(key));
    }),
    del: jest.fn(async (key: string) => {
      store.delete(fullKey(key));
    }),
    invalidate: jest.fn(async () => {
      store.clear();
    }),
    invalidatePattern: jest.fn(async (pattern: string) => {
      const normalized = pattern.replace(/\*/g, '.*');
      const regex = new RegExp(`^${namespace}:${normalized}$`);
      for (const key of Array.from(store.keys())) {
        if (regex.test(key)) {
          store.delete(key);
        }
      }
    }),
    generateCacheKey: jest.fn((base: string, params?: Record<string, unknown>) => {
      if (!params) return base;
      const sortedParams = Object.entries(params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join(':');
      return sortedParams ? `${base}:${sortedParams}` : base;
    }),
    getOrSet: jest.fn(async <T>(key: string, fetcher: () => Promise<T>) => {
      const cached = await cacheApi.get(key);
      if (cached !== null) {
        return cached as T;
      }
      const fresh = await fetcher();
      await cacheApi.set(key, fresh);
      return fresh;
    }),
  };

  return cacheApi;
});
