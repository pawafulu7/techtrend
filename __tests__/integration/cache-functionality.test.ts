// ioredisのモック
jest.mock('ioredis', () => {
  const mockStore = new Map();
  
  return jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
    set: jest.fn((key, value, ..._args) => {
      // RedisCacheクラスは既にJSON.stringifyしているので、そのまま保存
      mockStore.set(key, value);
      return Promise.resolve('OK');
    }),
    get: jest.fn((key) => {
      // 常に文字列またはnullを返す（RedisCache側でJSON.parse）
      return Promise.resolve(mockStore.get(key) || null);
    }),
    del: jest.fn((key) => {
      const existed = mockStore.has(key);
      mockStore.delete(key);
      return Promise.resolve(existed ? 1 : 0);
    }),
    keys: jest.fn((pattern) => {
      const allKeys = Array.from(mockStore.keys());
      if (pattern === '*') return Promise.resolve(allKeys);
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return Promise.resolve(allKeys.filter(key => regex.test(key)));
    }),
    ttl: jest.fn(() => Promise.resolve(59)),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  }));
});

import { RedisCache } from '@/lib/cache/redis-cache';
import { closeRedisConnection } from '@/lib/redis/client';

describe('RedisCache Functionality', () => {
  let cache: RedisCache;

  beforeAll(() => {
    cache = new RedisCache({
      ttl: 60,
      namespace: '@techtrend/test'
    });
  });

  afterAll(async () => {
    await closeRedisConnection();
  });

  afterEach(async () => {
    // Clean up test keys
    cache.resetStats();
  });

  describe('Basic Operations', () => {
    it('should set and get cached values', async () => {
      const key = 'test-cache-key';
      const value = { data: 'test data', timestamp: Date.now() };
      
      await cache.set(key, value);
      const retrieved = await cache.get(key);
      
      expect(retrieved).toEqual(value);
    });

    it('should return null for non-existent keys', async () => {
      const value = await cache.get('non-existent-key');
      expect(value).toBeNull();
    });

    it('should delete cached values', async () => {
      const key = 'delete-cache-key';
      await cache.set(key, 'value');
      await cache.delete(key);
      
      const value = await cache.get(key);
      expect(value).toBeNull();
    });
  });

  describe('Cache Key Generation', () => {
    it('should generate cache keys with prefix', () => {
      const key = cache.generateCacheKey('base', {
        prefix: 'api'
      });
      expect(key).toBe('api:base');
    });

    it('should generate cache keys with params', () => {
      const key = cache.generateCacheKey('articles', {
        params: {
          page: '1',
          limit: '20',
          sort: 'date'
        }
      });
      expect(key).toBe('articles:limit=20:page=1:sort=date');
    });

    it('should generate cache keys with both prefix and params', () => {
      const key = cache.generateCacheKey('data', {
        prefix: 'api',
        params: {
          id: '123',
          type: 'user'
        }
      });
      expect(key).toBe('api:data:id=123:type=user');
    });
  });

  describe('getOrSet Pattern', () => {
    it('should fetch and cache data when not cached', async () => {
      const key = 'get-or-set-key';
      let fetcherCalled = false;
      
      const fetcher = async () => {
        fetcherCalled = true;
        return { fresh: 'data' };
      };
      
      const result = await cache.getOrSet(key, fetcher);
      
      expect(fetcherCalled).toBe(true);
      expect(result).toEqual({ fresh: 'data' });
      
      // Second call should use cache
      fetcherCalled = false;
      const cachedResult = await cache.getOrSet(key, fetcher);
      
      expect(fetcherCalled).toBe(false);
      expect(cachedResult).toEqual({ fresh: 'data' });
    });
  });

  describe('Statistics', () => {
    it('should track cache hits and misses', async () => {
      const stats = cache.getStats();
      expect(stats).toEqual({ hits: 0, misses: 0, errors: 0 });
      
      // Miss
      await cache.get('stats-miss-key');
      let newStats = cache.getStats();
      expect(newStats.misses).toBe(1);
      expect(newStats.hits).toBe(0);
      
      // Hit
      await cache.set('stats-hit-key', 'value');
      await cache.get('stats-hit-key');
      newStats = cache.getStats();
      expect(newStats.hits).toBe(1);
    });

    it('should reset statistics', () => {
      cache.resetStats();
      const stats = cache.getStats();
      expect(stats).toEqual({ hits: 0, misses: 0, errors: 0 });
    });
  });
});