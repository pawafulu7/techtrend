import { AgentResponseCache } from '@/lib/cache/agent-response-cache';
import { getRedisClient } from '@/lib/redis-di';

// Mock Redis DI
jest.mock('@/lib/redis-di');

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  quit: jest.fn(),
};

describe('AgentResponseCache', () => {
  let cache: AgentResponseCache;

  beforeEach(() => {
    cache = new AgentResponseCache();
    jest.clearAllMocks();
    (getRedisClient as jest.Mock).mockResolvedValue(mockRedis);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('get', () => {
    it('should retrieve cached response', async () => {
      const query = 'React performance';
      const cachedResponse = 'Found 3 articles...';

      mockRedis.get.mockResolvedValue(cachedResponse);

      const result = await cache.get(query);

      expect(result).toBe(cachedResponse);
      expect(mockRedis.get).toHaveBeenCalledWith('agent:response:react performance');
    });

    it('should return null if cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cache.get('TypeScript');

      expect(result).toBeNull();
    });

    it('should return null if Redis unavailable', async () => {
      (getRedisClient as jest.Mock).mockResolvedValue(null);

      const result = await cache.get('query');

      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Connection failed'));

      const result = await cache.get('query');

      expect(result).toBeNull(); // Fail gracefully
    });
  });

  describe('set', () => {
    it('should cache response with TTL', async () => {
      const query = 'React performance';
      const response = 'Found 3 articles...';

      await cache.set(query, response);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'agent:response:react performance',
        60, // TTL
        response
      );
    });

    it('should skip caching if Redis unavailable', async () => {
      (getRedisClient as jest.Mock).mockResolvedValue(null);

      await cache.set('query', 'response');

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Write failed'));

      await expect(cache.set('query', 'response')).resolves.not.toThrow();
    });
  });

  describe('invalidate', () => {
    it('should delete cache entry', async () => {
      const query = 'React';

      await cache.invalidate(query);

      expect(mockRedis.del).toHaveBeenCalledWith('agent:response:react');
    });

    it('should handle errors gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Delete failed'));

      await expect(cache.invalidate('query')).resolves.not.toThrow();
    });
  });

  describe('query normalization', () => {
    it('should normalize queries for cache keys', async () => {
      mockRedis.get.mockResolvedValue('response');

      // All these should hit the same cache key
      await cache.get('  React   Performance  ');
      await cache.get('react performance');
      await cache.get('REACT PERFORMANCE');
      await cache.get('React Performance!');
      await cache.get('React Performance?');

      // Verify all calls used the same normalized key
      const calls = mockRedis.get.mock.calls;
      const keys = calls.map((call) => call[0]);

      expect(new Set(keys).size).toBe(1);
      expect(keys[0]).toBe('agent:response:react performance');
    });

    it('should remove Japanese punctuation', async () => {
      mockRedis.get.mockResolvedValue('response');

      await cache.get('最新のNext.js記事を教えて。');
      await cache.get('最新のNextjs記事を教えて');

      const calls = mockRedis.get.mock.calls;
      expect(calls[0][0]).toBe(calls[1][0]); // Same normalized key
    });
  });
});
