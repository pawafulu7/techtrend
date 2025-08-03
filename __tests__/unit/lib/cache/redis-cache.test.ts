import { Redis } from '@upstash/redis';
import { RedisCache } from '@/lib/cache/redis-cache';

// Mock Upstash Redis
jest.mock('@upstash/redis');

describe('RedisCache', () => {
  let mockRedis: jest.Mocked<Redis>;
  let cache: RedisCache;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock Redis instance
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    } as any;

    // Mock Redis constructor
    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => mockRedis);
    
    // Create cache instance
    cache = new RedisCache(mockRedis);
  });

  describe('generateCacheKey', () => {
    it('should generate basic cache key', () => {
      const key = cache.generateCacheKey('test');
      expect(key).toBe('test');
    });

    it('should generate cache key with prefix', () => {
      const key = cache.generateCacheKey('test', { prefix: 'api' });
      expect(key).toBe('api:test');
    });

    it('should generate cache key with sorted params', () => {
      const key = cache.generateCacheKey('test', {
        params: { b: '2', a: '1', c: '3' }
      });
      expect(key).toBe('test:a=1:b=2:c=3');
    });

    it('should generate cache key with prefix and params', () => {
      const key = cache.generateCacheKey('test', {
        prefix: 'api',
        params: { id: '123', type: 'user' }
      });
      expect(key).toBe('api:test:id=123:type=user');
    });
  });

  describe('get', () => {
    it('should return cached value on hit', async () => {
      const testData = { id: 1, name: 'Test' };
      mockRedis.get.mockResolvedValue(testData);

      const result = await cache.get('test-key');
      
      expect(mockRedis.get).toHaveBeenCalledWith('@techtrend/cache:test-key');
      expect(result).toEqual(testData);
      expect(cache.getStats().hits).toBe(1);
      expect(cache.getStats().misses).toBe(0);
    });

    it('should return null on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cache.get('test-key');
      
      expect(result).toBeNull();
      expect(cache.getStats().hits).toBe(0);
      expect(cache.getStats().misses).toBe(1);
    });

    it('should handle errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await cache.get('test-key');
      
      expect(result).toBeNull();
      expect(cache.getStats().errors).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('set', () => {
    it('should set value with default TTL', async () => {
      const testData = { id: 1, name: 'Test' };

      await cache.set('test-key', testData);
      
      expect(mockRedis.set).toHaveBeenCalledWith(
        '@techtrend/cache:test-key',
        JSON.stringify(testData),
        { ex: 3600 }
      );
    });

    it('should set value with custom TTL', async () => {
      const testData = { id: 1, name: 'Test' };

      await cache.set('test-key', testData, 1800);
      
      expect(mockRedis.set).toHaveBeenCalledWith(
        '@techtrend/cache:test-key',
        JSON.stringify(testData),
        { ex: 1800 }
      );
    });

    it('should handle errors gracefully', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis error'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await cache.set('test-key', { data: 'test' });
      
      expect(cache.getStats().errors).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('delete', () => {
    it('should delete cached value', async () => {
      await cache.delete('test-key');
      
      expect(mockRedis.del).toHaveBeenCalledWith('@techtrend/cache:test-key');
    });

    it('should handle errors gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await cache.delete('test-key');
      
      expect(cache.getStats().errors).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      const cachedData = { id: 1, name: 'Cached' };
      mockRedis.get.mockResolvedValue(cachedData);
      
      const fetcher = jest.fn().mockResolvedValue({ id: 1, name: 'Fresh' });
      
      const result = await cache.getOrSet('test-key', fetcher);
      
      expect(result).toEqual(cachedData);
      expect(fetcher).not.toHaveBeenCalled();
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('should fetch and cache if miss', async () => {
      const freshData = { id: 1, name: 'Fresh' };
      mockRedis.get.mockResolvedValue(null);
      
      const fetcher = jest.fn().mockResolvedValue(freshData);
      
      const result = await cache.getOrSet('test-key', fetcher);
      
      expect(result).toEqual(freshData);
      expect(fetcher).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalledWith(
        '@techtrend/cache:test-key',
        JSON.stringify(freshData),
        { ex: 3600 }
      );
    });

    it('should use custom TTL', async () => {
      const freshData = { id: 1, name: 'Fresh' };
      mockRedis.get.mockResolvedValue(null);
      
      const fetcher = jest.fn().mockResolvedValue(freshData);
      
      await cache.getOrSet('test-key', fetcher, 7200);
      
      expect(mockRedis.set).toHaveBeenCalledWith(
        '@techtrend/cache:test-key',
        JSON.stringify(freshData),
        { ex: 7200 }
      );
    });
  });

  describe('stats', () => {
    it('should track cache statistics', async () => {
      // Hit
      mockRedis.get.mockResolvedValue({ data: 'test' });
      await cache.get('key1');
      
      // Miss
      mockRedis.get.mockResolvedValue(null);
      await cache.get('key2');
      
      // Error
      mockRedis.get.mockRejectedValue(new Error('Error'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      await cache.get('key3');
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.errors).toBe(1);
      
      consoleErrorSpy.mockRestore();
    });

    it('should reset statistics', () => {
      cache.resetStats();
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.errors).toBe(0);
    });
  });

  describe('custom namespace', () => {
    it('should use custom namespace', async () => {
      const customCache = new RedisCache(mockRedis, {
        namespace: '@custom/cache'
      });
      
      await customCache.get('test-key');
      
      expect(mockRedis.get).toHaveBeenCalledWith('@custom/cache:test-key');
    });
  });

  describe('custom TTL', () => {
    it('should use custom default TTL', async () => {
      const customCache = new RedisCache(mockRedis, {
        ttl: 7200
      });
      
      await customCache.set('test-key', { data: 'test' });
      
      expect(mockRedis.set).toHaveBeenCalledWith(
        '@techtrend/cache:test-key',
        JSON.stringify({ data: 'test' }),
        { ex: 7200 }
      );
    });
  });
});