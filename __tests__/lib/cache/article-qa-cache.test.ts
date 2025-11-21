import { ArticleQACache } from '@/lib/cache/article-qa-cache';
import { getRedisClient } from '@/lib/redis-di';

// Mock Redis DI
jest.mock('@/lib/redis-di');

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  quit: jest.fn(),
};

describe('ArticleQACache', () => {
  let cache: ArticleQACache;
  const articleId = 'article123';
  const query = 'What are the prerequisites?';
  const locale: 'ja' | 'en' = 'ja';
  const updatedAt = new Date('2025-10-15T10:00:00Z');

  beforeEach(() => {
    cache = new ArticleQACache();
    jest.clearAllMocks();
    (getRedisClient as jest.Mock).mockResolvedValue(mockRedis);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('get', () => {
    it('should retrieve cached response with correct cache key', async () => {
      const cachedResponse = 'この記事の前提知識は...';

      mockRedis.get.mockResolvedValue(cachedResponse);

      const result = await cache.get(articleId, query, locale, updatedAt);

      expect(result).toBe(cachedResponse);
      expect(mockRedis.get).toHaveBeenCalledWith(
        `article-qa:article123:what are the prerequisites:ja:${updatedAt.getTime()}`
      );
    });

    it('should return null if cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cache.get(articleId, query, locale, updatedAt);

      expect(result).toBeNull();
    });

    it('should return null if Redis unavailable', async () => {
      (getRedisClient as jest.Mock).mockResolvedValue(null);

      const result = await cache.get(articleId, query, locale, updatedAt);

      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Connection failed'));

      const result = await cache.get(articleId, query, locale, updatedAt);

      expect(result).toBeNull(); // Fail gracefully
    });

    it('should invalidate cache when article is updated', async () => {
      const oldUpdatedAt = new Date('2025-10-15T10:00:00Z');
      const newUpdatedAt = new Date('2025-10-16T10:00:00Z');

      mockRedis.get.mockResolvedValue('cached response');

      // Same query, different updatedAt should produce different cache keys
      await cache.get(articleId, query, locale, oldUpdatedAt);
      await cache.get(articleId, query, locale, newUpdatedAt);

      const calls = mockRedis.get.mock.calls;
      expect(calls[0][0]).not.toBe(calls[1][0]); // Different keys
      expect(calls[0][0]).toContain(oldUpdatedAt.getTime().toString());
      expect(calls[1][0]).toContain(newUpdatedAt.getTime().toString());
    });
  });

  describe('set', () => {
    it('should cache response with 5-minute TTL', async () => {
      const response = 'この記事の前提知識は...';

      await cache.set(articleId, query, locale, updatedAt, response);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `article-qa:article123:what are the prerequisites:ja:${updatedAt.getTime()}`,
        300, // 5 minutes
        response
      );
    });

    it('should skip caching if Redis unavailable', async () => {
      (getRedisClient as jest.Mock).mockResolvedValue(null);

      await cache.set(articleId, query, locale, updatedAt, 'response');

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Write failed'));

      await expect(
        cache.set(articleId, query, locale, updatedAt, 'response')
      ).resolves.not.toThrow();
    });

    it('should enforce token limit (10,000 tokens)', async () => {
      // Create a very long response (>10,000 tokens)
      // Each unique word is ~1-2 tokens, so we need diverse content
      const words = ['optimization', 'performance', 'implementation', 'architecture', 'scalability'];
      const longResponse = words.map(w => w.repeat(500)).join(' ').repeat(10); // >40,000 tokens

      await cache.set(articleId, query, locale, updatedAt, longResponse);

      // Should NOT cache (exceeds token limit)
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should cache response within token limit', async () => {
      // Create a normal response (~1,000 tokens)
      const normalResponse = 'a'.repeat(4000); // ~1,000 tokens

      await cache.set(articleId, query, locale, updatedAt, normalResponse);

      // Should cache successfully
      expect(mockRedis.setex).toHaveBeenCalled();
    });
  });

  describe('invalidate', () => {
    it('should delete cache entry', async () => {
      await cache.invalidate(articleId, query, locale, updatedAt);

      expect(mockRedis.del).toHaveBeenCalledWith(
        `article-qa:article123:what are the prerequisites:ja:${updatedAt.getTime()}`
      );
    });

    it('should handle errors gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Delete failed'));

      await expect(
        cache.invalidate(articleId, query, locale, updatedAt)
      ).resolves.not.toThrow();
    });
  });

  describe('invalidateArticle', () => {
    it('should delete all cache entries for an article', async () => {
      const keys = [
        'article-qa:article123:query1:ja:123456789',
        'article-qa:article123:query2:en:123456789',
        'article-qa:article123:query3:ja:987654321',
      ];

      mockRedis.keys.mockResolvedValue(keys);

      await cache.invalidateArticle(articleId);

      expect(mockRedis.keys).toHaveBeenCalledWith('article-qa:article123:*');
      expect(mockRedis.del).toHaveBeenCalledWith(...keys);
    });

    it('should handle no keys found', async () => {
      mockRedis.keys.mockResolvedValue([]);

      await cache.invalidateArticle(articleId);

      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockRedis.keys.mockRejectedValue(new Error('Keys failed'));

      await expect(cache.invalidateArticle(articleId)).resolves.not.toThrow();
    });
  });

  describe('locale-specific caching', () => {
    it('should create different cache keys for different locales', async () => {
      mockRedis.get.mockResolvedValue('cached');

      await cache.get(articleId, query, 'ja', updatedAt);
      await cache.get(articleId, query, 'en', updatedAt);

      const calls = mockRedis.get.mock.calls;
      expect(calls[0][0]).toContain(':ja:');
      expect(calls[1][0]).toContain(':en:');
      expect(calls[0][0]).not.toBe(calls[1][0]); // Different keys
    });
  });

  describe('query normalization', () => {
    it('should normalize queries for cache keys', async () => {
      mockRedis.get.mockResolvedValue('response');

      // All these should hit the same cache key
      await cache.get(articleId, '  What   are   prerequisites  ', locale, updatedAt);
      await cache.get(articleId, 'what are prerequisites', locale, updatedAt);
      await cache.get(articleId, 'WHAT ARE PREREQUISITES', locale, updatedAt);
      await cache.get(articleId, 'What are prerequisites!', locale, updatedAt);
      await cache.get(articleId, 'What are prerequisites?', locale, updatedAt);

      // Verify all calls used the same normalized query
      const calls = mockRedis.get.mock.calls;
      const keys = calls.map((call) => call[0]);

      expect(new Set(keys).size).toBe(1);
      expect(keys[0]).toContain(':what are prerequisites:');
    });

    it('should remove Japanese punctuation', async () => {
      mockRedis.get.mockResolvedValue('response');

      await cache.get(articleId, '前提となる概念を教えて。', locale, updatedAt);
      await cache.get(articleId, '前提となる概念を教えて', locale, updatedAt);

      const calls = mockRedis.get.mock.calls;
      expect(calls[0][0]).toBe(calls[1][0]); // Same normalized key
    });
  });
});
