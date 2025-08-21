// モックを先に設定する必要がある
jest.mock('ioredis');

const mockRedisInstance = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn().mockResolvedValue([]),
  on: jest.fn(),
  quit: jest.fn(),
};

jest.mock('@/lib/redis/client', () => ({
  getRedisClient: jest.fn(() => mockRedisInstance)
}));

// Import after mocking
import { RedisCache } from '@/lib/cache/redis-cache';

describe('RedisCache', () => {
  let cache: RedisCache;
  let mockRedis: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Reset mock functions
    mockRedisInstance.get.mockClear();
    mockRedisInstance.set.mockClear();
    mockRedisInstance.del.mockClear();
    mockRedisInstance.keys.mockClear();
    mockRedisInstance.keys.mockResolvedValue([]);
    
    // Get reference to mock
    mockRedis = mockRedisInstance;
    
    // Create cache instance
    cache = new RedisCache();
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

    it('should generate cache key with params', () => {
      const key = cache.generateCacheKey('test', {
        params: { id: '123', type: 'user' }
      });
      expect(key).toBe('test:id=123:type=user');
    });

    it('should sort params alphabetically', () => {
      const key = cache.generateCacheKey('test', {
        params: { z: '1', a: '2', m: '3' }
      });
      expect(key).toBe('test:a=2:m=3:z=1');
    });

    it('should handle empty params', () => {
      const key = cache.generateCacheKey('test', {
        params: {}
      });
      expect(key).toBe('test');
    });

    it('should combine prefix and params', () => {
      const key = cache.generateCacheKey('test', {
        prefix: 'api',
        params: { id: '123' }
      });
      expect(key).toBe('api:test:id=123');
    });
  });

  describe('get', () => {
    it('should retrieve and parse cached value', async () => {
      const testData = { foo: 'bar' };
      mockRedis.get.mockResolvedValue(JSON.stringify(testData));

      const result = await cache.get('test-key');
      
      expect(mockRedis.get).toHaveBeenCalledWith('@techtrend/cache:test-key');
      expect(result).toEqual(testData);
    });

    it('should return null for non-existent key', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cache.get('non-existent');
      
      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await cache.get('error-key');
      
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Cache get error for key error-key:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('should track cache hits and misses', async () => {
      // Miss
      mockRedis.get.mockResolvedValue(null);
      await cache.get('miss-key');
      
      // Hit
      mockRedis.get.mockResolvedValue(JSON.stringify({ data: 'value' }));
      await cache.get('hit-key');
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.errors).toBe(0);
    });
  });

  describe('set', () => {
    it('should stringify and store value', async () => {
      const testData = { foo: 'bar' };
      
      await cache.set('test-key', testData);
      
      expect(mockRedis.set).toHaveBeenCalledWith(
        '@techtrend/cache:test-key',
        JSON.stringify(testData),
        'EX',
        3600
      );
    });

    it('should use custom TTL', async () => {
      await cache.set('test-key', 'value', 300);
      
      expect(mockRedis.set).toHaveBeenCalledWith(
        '@techtrend/cache:test-key',
        JSON.stringify('value'),
        'EX',
        300
      );
    });

    it('should handle errors gracefully', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await cache.set('error-key', 'value');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Cache set error for key error-key:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('delete', () => {
    it('should delete cached value', async () => {
      await cache.delete('test-key');
      
      expect(mockRedis.del).toHaveBeenCalledWith('@techtrend/cache:test-key');
    });

    it('should handle errors gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await cache.delete('error-key');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Cache delete error for key error-key:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('invalidatePattern', () => {
    it('should delete all keys matching pattern', async () => {
      const matchingKeys = [
        '@techtrend/cache:users:1',
        '@techtrend/cache:users:2',
        '@techtrend/cache:users:3'
      ];
      mockRedis.keys.mockResolvedValue(matchingKeys);

      await cache.invalidatePattern('users:*');
      
      expect(mockRedis.keys).toHaveBeenCalledWith('@techtrend/cache:users:*');
      expect(mockRedis.del).toHaveBeenCalledWith(...matchingKeys);
    });

    it('should handle no matching keys', async () => {
      mockRedis.keys.mockResolvedValue([]);

      await cache.invalidatePattern('nothing:*');
      
      expect(mockRedis.keys).toHaveBeenCalledWith('@techtrend/cache:nothing:*');
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockRedis.keys.mockRejectedValue(new Error('Redis error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await cache.invalidatePattern('error:*');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Cache invalidation error for pattern error:*:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      const cachedData = { cached: true };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));
      
      const fetcher = jest.fn();
      const result = await cache.getOrSet('test-key', fetcher);
      
      expect(result).toEqual(cachedData);
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('should fetch and cache if not exists', async () => {
      const freshData = { fresh: true };
      mockRedis.get.mockResolvedValue(null);
      
      const fetcher = jest.fn().mockResolvedValue(freshData);
      const result = await cache.getOrSet('test-key', fetcher);
      
      expect(result).toEqual(freshData);
      expect(fetcher).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalledWith(
        '@techtrend/cache:test-key',
        JSON.stringify(freshData),
        'EX',
        3600
      );
    });

    it('should use custom TTL', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      const fetcher = jest.fn().mockResolvedValue('value');
      await cache.getOrSet('test-key', fetcher, 600);
      
      expect(mockRedis.set).toHaveBeenCalledWith(
        '@techtrend/cache:test-key',
        JSON.stringify('value'),
        'EX',
        600
      );
    });
  });

  describe('statistics', () => {
    it('should track all operation statistics', async () => {
      // Initial stats
      expect(cache.getStats()).toEqual({
        hits: 0,
        misses: 0,
        errors: 0
      });

      // Generate some stats
      mockRedis.get.mockResolvedValue(null); // miss
      await cache.get('key1');
      
      mockRedis.get.mockResolvedValue(JSON.stringify('value')); // hit
      await cache.get('key2');
      
      mockRedis.get.mockRejectedValue(new Error('error')); // error
      jest.spyOn(console, 'error').mockImplementation();
      await cache.get('key3');

      const stats = cache.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.errors).toBe(1);
    });

    it('should reset statistics', () => {
      // Generate some stats first
      cache.getStats().hits = 10;
      cache.getStats().misses = 5;
      cache.getStats().errors = 2;

      cache.resetStats();
      
      expect(cache.getStats()).toEqual({
        hits: 0,
        misses: 0,
        errors: 0
      });
    });
  });

  describe('custom namespace', () => {
    it('should use custom namespace', async () => {
      const customCache = new RedisCache({
        namespace: '@custom/namespace'
      });

      await customCache.get('test-key');
      
      expect(mockRedis.get).toHaveBeenCalledWith('@custom/namespace:test-key');
    });

    it('should use custom TTL', async () => {
      const customCache = new RedisCache({
        ttl: 7200 // 2 hours
      });

      await customCache.set('test-key', 'value');
      
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'EX',
        7200
      );
    });
  });
});