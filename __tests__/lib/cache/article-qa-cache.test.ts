import { ArticleQACache } from '@/lib/cache/article-qa-cache';

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  hashSensitiveValue: jest.fn((v: string) => `hashed:${v}`),
}));

const NAMESPACE = '@techtrend/cache:rag-qa';

const mockPipeline = {
  unlink: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  scanStream: jest.fn(),
  pipeline: jest.fn(() => mockPipeline),
};

describe('ArticleQACache', () => {
  let cache: ArticleQACache;
  const articleId = 'article123';
  const query = 'What are the prerequisites?';
  const locale: 'ja' | 'en' = 'ja';
  const updatedAt = new Date('2025-10-15T10:00:00Z');

  beforeEach(() => {
    Object.values(mockRedis).forEach((fn) => {
      (fn as jest.Mock).mockReset();
    });
    mockRedis.pipeline.mockReturnValue(mockPipeline);
    mockPipeline.unlink.mockClear().mockReturnThis();
    mockPipeline.exec.mockClear().mockResolvedValue([]);
    cache = new ArticleQACache();
    // Replace private redis field with mock (pattern from redis-cache.test.ts)
    (cache as any).redis = mockRedis;
  });

  describe('getResponse', () => {
    it('should retrieve cached response with correct cache key', async () => {
      const cachedResponse = { text: 'この記事の前提知識は...', toolCalls: [] };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedResponse));

      const result = await cache.getResponse(
        articleId,
        query,
        locale,
        updatedAt
      );

      expect(result).toEqual(cachedResponse);
      expect(mockRedis.get).toHaveBeenCalledWith(
        `${NAMESPACE}:article123:what are the prerequisites:ja:${updatedAt.getTime()}`
      );
    });

    it('should return null if cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cache.getResponse(
        articleId,
        query,
        locale,
        updatedAt
      );

      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Connection failed'));

      const result = await cache.getResponse(
        articleId,
        query,
        locale,
        updatedAt
      );

      expect(result).toBeNull(); // Fail gracefully
    });

    it('should invalidate cache when article is updated', async () => {
      const oldUpdatedAt = new Date('2025-10-15T10:00:00Z');
      const newUpdatedAt = new Date('2025-10-16T10:00:00Z');

      mockRedis.get.mockResolvedValue(
        JSON.stringify({ text: 'cached response', toolCalls: [] })
      );

      // Same query, different updatedAt should produce different cache keys
      await cache.getResponse(articleId, query, locale, oldUpdatedAt);
      await cache.getResponse(articleId, query, locale, newUpdatedAt);

      const calls = mockRedis.get.mock.calls;
      expect(calls[0][0]).not.toBe(calls[1][0]); // Different keys
      expect(calls[0][0]).toContain(oldUpdatedAt.getTime().toString());
      expect(calls[1][0]).toContain(newUpdatedAt.getTime().toString());
    });
  });

  describe('setResponse', () => {
    it('should cache response with 5-minute TTL', async () => {
      const response = { text: 'この記事の前提知識は...', toolCalls: [] };

      await cache.setResponse(articleId, query, locale, updatedAt, response);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `${NAMESPACE}:article123:what are the prerequisites:ja:${updatedAt.getTime()}`,
        300, // 5 minutes
        JSON.stringify(response)
      );
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Write failed'));

      await expect(
        cache.setResponse(articleId, query, locale, updatedAt, {
          text: 'response',
          toolCalls: [],
        })
      ).resolves.not.toThrow();
    });

    it('should enforce token limit (10,000 tokens)', async () => {
      // Create a very long response (>10,000 tokens)
      const words = [
        'optimization',
        'performance',
        'implementation',
        'architecture',
        'scalability',
      ];
      const longText = words
        .map((w) => w.repeat(500))
        .join(' ')
        .repeat(10); // >40,000 tokens

      await cache.setResponse(articleId, query, locale, updatedAt, {
        text: longText,
        toolCalls: [],
      });

      // Should NOT cache (exceeds token limit)
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should cache response within token limit', async () => {
      // Create a normal response (~1,000 tokens)
      const normalResponse = { text: 'a'.repeat(4000), toolCalls: [] }; // ~1,000 tokens

      await cache.setResponse(
        articleId,
        query,
        locale,
        updatedAt,
        normalResponse
      );

      // Should cache successfully
      expect(mockRedis.setex).toHaveBeenCalled();
    });
  });

  describe('invalidateResponse', () => {
    it('should delete cache entry', async () => {
      mockRedis.del.mockResolvedValue(1);

      await cache.invalidateResponse(articleId, query, locale, updatedAt);

      expect(mockRedis.del).toHaveBeenCalledWith(
        `${NAMESPACE}:article123:what are the prerequisites:ja:${updatedAt.getTime()}`
      );
    });

    it('should handle errors gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Delete failed'));

      await expect(
        cache.invalidateResponse(articleId, query, locale, updatedAt)
      ).resolves.not.toThrow();
    });
  });

  describe('invalidateArticle', () => {
    it('should call invalidatePattern with article-specific pattern', async () => {
      // Spy on the inherited invalidatePattern method
      const invalidatePatternSpy = jest.spyOn(
        cache as any,
        'invalidatePattern'
      );

      // Mock scanStream for the invalidatePattern call
      const mockStream = {
        on: jest
          .fn()
          .mockImplementation(
            (event: string, cb: (...args: unknown[]) => void) => {
              if (event === 'end') {
                cb();
              }
              return mockStream;
            }
          ),
      };
      mockRedis.scanStream.mockReturnValue(mockStream);

      await cache.invalidateArticle(articleId);

      expect(invalidatePatternSpy).toHaveBeenCalledWith('article123:*');
      invalidatePatternSpy.mockRestore();
    });

    it('should handle errors gracefully', async () => {
      const mockStream = {
        on: jest
          .fn()
          .mockImplementation(
            (event: string, cb: (...args: unknown[]) => void) => {
              if (event === 'error') {
                cb(new Error('Scan failed'));
              }
              return mockStream;
            }
          ),
      };
      mockRedis.scanStream.mockReturnValue(mockStream);

      await expect(cache.invalidateArticle(articleId)).resolves.not.toThrow();
    });
  });

  describe('locale-specific caching', () => {
    it('should create different cache keys for different locales', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ text: 'cached', toolCalls: [] })
      );

      await cache.getResponse(articleId, query, 'ja', updatedAt);
      await cache.getResponse(articleId, query, 'en', updatedAt);

      const calls = mockRedis.get.mock.calls;
      expect(calls[0][0]).toContain(':ja:');
      expect(calls[1][0]).toContain(':en:');
      expect(calls[0][0]).not.toBe(calls[1][0]); // Different keys
    });
  });

  describe('query normalization', () => {
    it('should normalize queries for cache keys', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ text: 'response', toolCalls: [] })
      );

      // All these should hit the same cache key
      await cache.getResponse(
        articleId,
        '  What   are   prerequisites  ',
        locale,
        updatedAt
      );
      await cache.getResponse(
        articleId,
        'what are prerequisites',
        locale,
        updatedAt
      );
      await cache.getResponse(
        articleId,
        'WHAT ARE PREREQUISITES',
        locale,
        updatedAt
      );
      await cache.getResponse(
        articleId,
        'What are prerequisites!',
        locale,
        updatedAt
      );
      await cache.getResponse(
        articleId,
        'What are prerequisites?',
        locale,
        updatedAt
      );

      // Verify all calls used the same normalized query
      const calls = mockRedis.get.mock.calls;
      const keys = calls.map((call: unknown[]) => call[0]);

      expect(new Set(keys).size).toBe(1);
      expect(keys[0]).toContain(':what are prerequisites:');
    });

    it('should remove Japanese punctuation', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ text: 'response', toolCalls: [] })
      );

      await cache.getResponse(
        articleId,
        '前提となる概念を教えて。',
        locale,
        updatedAt
      );
      await cache.getResponse(
        articleId,
        '前提となる概念を教えて',
        locale,
        updatedAt
      );

      const calls = mockRedis.get.mock.calls;
      expect(calls[0][0]).toBe(calls[1][0]); // Same normalized key
    });
  });

  describe('stats tracking', () => {
    it('should track cache hits and misses', async () => {
      mockRedis.get
        .mockResolvedValueOnce(
          JSON.stringify({ text: 'response', toolCalls: [] })
        )
        .mockResolvedValueOnce(null);

      await cache.getResponse(articleId, 'hit query', locale, updatedAt);
      await cache.getResponse(articleId, 'miss query', locale, updatedAt);

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe('backward compatibility', () => {
    it('should handle old string format from Redis', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify('old plain text response')
      );

      const result = await cache.getResponse(
        articleId,
        query,
        locale,
        updatedAt
      );

      expect(result).toEqual({
        text: 'old plain text response',
        toolCalls: [],
      });
    });
  });

  describe('toolCalls preservation', () => {
    it('should preserve toolCalls through set/get cycle', async () => {
      const toolCalls = [
        {
          id: 'tc1',
          name: 'article-search',
          input: { articleId: 'test' },
          output: { content: 'result' },
        },
      ];
      const response = { text: 'Answer about article', toolCalls };

      await cache.setResponse(articleId, query, locale, updatedAt, response);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        300,
        JSON.stringify(response)
      );
    });

    it('should enforce token limit on text only, not toolCalls', async () => {
      // Text is within limit, but toolCalls are large
      const largeToolCalls = Array(100).fill({
        id: 'tc1',
        name: 'semantic-search',
        input: { query: 'test' },
        output: { results: 'x'.repeat(1000) },
      });
      const response = { text: 'Short answer', toolCalls: largeToolCalls };

      await cache.setResponse(articleId, query, locale, updatedAt, response);

      // Should cache because text is short (token limit only checks text)
      expect(mockRedis.setex).toHaveBeenCalled();
    });
  });
});
