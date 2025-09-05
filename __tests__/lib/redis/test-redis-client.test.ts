import { TestRedisClient } from '../../../lib/redis/test-redis-client';

describe('TestRedisClient', () => {
  let client: TestRedisClient;

  beforeEach(() => {
    jest.useFakeTimers();
    client = new TestRedisClient();
  });

  afterEach(() => {
    client.clear();
    jest.useRealTimers();
  });

  describe('Basic Operations', () => {
    it('should set and get values', async () => {
      await client.set('key1', 'value1');
      const value = await client.get('key1');
      expect(value).toBe('value1');
    });

    it('should return null for non-existent keys', async () => {
      const value = await client.get('nonexistent');
      expect(value).toBeNull();
    });

    it('should overwrite existing values', async () => {
      await client.set('key1', 'value1');
      await client.set('key1', 'value2');
      const value = await client.get('key1');
      expect(value).toBe('value2');
    });

    it('should delete keys', async () => {
      await client.set('key1', 'value1');
      await client.set('key2', 'value2');
      
      const deleted = await client.del('key1');
      expect(deleted).toBe(1);
      
      expect(await client.get('key1')).toBeNull();
      expect(await client.get('key2')).toBe('value2');
    });

    it('should delete multiple keys', async () => {
      await client.set('key1', 'value1');
      await client.set('key2', 'value2');
      await client.set('key3', 'value3');
      
      const deleted = await client.del(['key1', 'key2']);
      expect(deleted).toBe(2);
      
      expect(await client.get('key1')).toBeNull();
      expect(await client.get('key2')).toBeNull();
      expect(await client.get('key3')).toBe('value3');
    });

    it('should check if key exists', async () => {
      await client.set('exists', 'yes');
      
      expect(await client.exists('exists')).toBe(1);
      expect(await client.exists('nonexistent')).toBe(0);
    });
  });

  describe('Expiration Operations', () => {
    it('should set value with expiration', async () => {
      await client.setex('temp', 60, 'temporary');
      
      const value = await client.get('temp');
      expect(value).toBe('temporary');
      
      const ttl = await client.ttl('temp');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should expire keys after timeout', async () => {
      // Set with 0 seconds expiration (immediate)
      await client.setex('expired', 0, 'value');
      
      // Advance timers
      jest.advanceTimersByTime(10);
      
      const value = await client.get('expired');
      expect(value).toBeNull();
    });

    it('should set expiration on existing key', async () => {
      await client.set('key', 'value');
      
      const result = await client.expire('key', 30);
      expect(result).toBe(1);
      
      const ttl = await client.ttl('key');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(30);
    });

    it('should return 0 when setting expiration on non-existent key', async () => {
      const result = await client.expire('nonexistent', 30);
      expect(result).toBe(0);
    });

    it('should get TTL correctly', async () => {
      await client.setex('temp', 100, 'value');
      const ttl = await client.ttl('temp');
      
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(100);
    });

    it('should return -1 for keys without expiration', async () => {
      await client.set('permanent', 'value');
      const ttl = await client.ttl('permanent');
      expect(ttl).toBe(-1);
    });

    it('should return -2 for non-existent keys', async () => {
      const ttl = await client.ttl('nonexistent');
      expect(ttl).toBe(-2);
    });

    it('should clean up expired keys on access', async () => {
      await client.setex('expired', 0, 'value');
      jest.advanceTimersByTime(10);
      
      expect(await client.exists('expired')).toBe(0);
      expect(client.size()).toBe(0);
    });
  });

  describe('Pattern Matching', () => {
    beforeEach(async () => {
      await client.set('user:1', 'Alice');
      await client.set('user:2', 'Bob');
      await client.set('post:1', 'Post 1');
      await client.set('post:2', 'Post 2');
      await client.set('comment:1', 'Comment 1');
    });

    it('should find keys with wildcard pattern', async () => {
      const userKeys = await client.keys('user:*');
      expect(userKeys.sort()).toEqual(['user:1', 'user:2']);
      
      const postKeys = await client.keys('post:*');
      expect(postKeys.sort()).toEqual(['post:1', 'post:2']);
    });

    it('should find all keys with * pattern', async () => {
      const allKeys = await client.keys('*');
      expect(allKeys.sort()).toEqual([
        'comment:1',
        'post:1',
        'post:2',
        'user:1',
        'user:2',
      ]);
    });

    it('should find keys with ? pattern', async () => {
      const keys = await client.keys('user:?');
      expect(keys.sort()).toEqual(['user:1', 'user:2']);
    });

    it('should return empty array for non-matching pattern', async () => {
      const keys = await client.keys('nonexistent:*');
      expect(keys).toEqual([]);
    });

    it('should exclude expired keys from pattern search', async () => {
      await client.setex('temp:1', 0, 'expired');
      jest.advanceTimersByTime(10);
      
      const keys = await client.keys('temp:*');
      expect(keys).toEqual([]);
    });
  });

  describe('Batch Operations', () => {
    it('should get multiple values', async () => {
      await client.set('key1', 'value1');
      await client.set('key2', 'value2');
      
      const values = await client.mget(['key1', 'key2', 'key3']);
      expect(values).toEqual(['value1', 'value2', null]);
    });

    it('should set multiple values', async () => {
      await client.mset({
        'batch:1': 'value1',
        'batch:2': 'value2',
        'batch:3': 'value3',
      });
      
      expect(await client.get('batch:1')).toBe('value1');
      expect(await client.get('batch:2')).toBe('value2');
      expect(await client.get('batch:3')).toBe('value3');
    });
  });

  describe('Connection Management', () => {
    it('should ping successfully', async () => {
      const pong = await client.ping();
      expect(pong).toBe('PONG');
    });

    it('should quit and clear data', async () => {
      await client.set('key1', 'value1');
      await client.set('key2', 'value2');
      
      await client.quit();
      
      expect(client.size()).toBe(0);
    });

    it('should throw error when disconnected', async () => {
      client.setConnected(false);
      
      await expect(client.get('key')).rejects.toThrow('Redis client is not connected');
      await expect(client.set('key', 'value')).rejects.toThrow('Redis client is not connected');
    });

    it('should reconnect after setting connected', async () => {
      client.setConnected(false);
      await expect(client.get('key')).rejects.toThrow();
      
      client.setConnected(true);
      await client.set('key', 'value');
      expect(await client.get('key')).toBe('value');
    });
  });

  describe('Test Utilities', () => {
    it('should clear all data', async () => {
      await client.set('key1', 'value1');
      await client.set('key2', 'value2');
      
      client.clear();
      
      expect(client.size()).toBe(0);
      expect(await client.get('key1')).toBeNull();
      expect(await client.get('key2')).toBeNull();
    });

    it('should get all data', async () => {
      await client.set('key1', 'value1');
      await client.set('key2', 'value2');
      
      const allData = client.getAll();
      
      expect(allData.size).toBe(2);
      expect(allData.get('key1')).toEqual({ value: 'value1' });
      expect(allData.get('key2')).toEqual({ value: 'value2' });
    });

    it('should report correct size', async () => {
      expect(client.size()).toBe(0);
      
      await client.set('key1', 'value1');
      expect(client.size()).toBe(1);
      
      await client.set('key2', 'value2');
      expect(client.size()).toBe(2);
      
      await client.del('key1');
      expect(client.size()).toBe(1);
    });

    it('should simulate delay', async () => {
      const delayPromise = client.simulateDelay(50);
      jest.advanceTimersByTime(50);
      await delayPromise;
      
      // With fake timers, we verify the timer was advanced
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string values', async () => {
      await client.set('empty', '');
      expect(await client.get('empty')).toBe('');
    });

    it('should handle special characters in keys', async () => {
      const specialKey = 'key:with:colons:and-dashes_underscores';
      await client.set(specialKey, 'value');
      expect(await client.get(specialKey)).toBe('value');
    });

    it('should handle large values', async () => {
      const largeValue = 'x'.repeat(10000);
      await client.set('large', largeValue);
      expect(await client.get('large')).toBe(largeValue);
    });

    it('should handle rapid expiration checks', async () => {
      await client.setex('rapid', 1, 'value');
      
      // Multiple rapid checks
      for (let i = 0; i < 10; i++) {
        const exists = await client.exists('rapid');
        expect(exists).toBe(1);
      }
      
      // Wait for expiration with fake timers
      jest.advanceTimersByTime(3000);
      
      const exists = await client.exists('rapid');
      expect(exists).toBe(0);
    });
  });

});

