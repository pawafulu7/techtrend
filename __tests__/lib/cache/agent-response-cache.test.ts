import { AgentResponseCache } from '@/lib/cache/agent-response-cache';

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

const NAMESPACE = '@techtrend/cache:rag-agent';

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
};

describe('AgentResponseCache', () => {
  let cache: AgentResponseCache;

  beforeEach(() => {
    Object.values(mockRedis).forEach((fn) => {
      (fn as jest.Mock).mockReset();
    });
    cache = new AgentResponseCache();
    // Replace private redis field with mock (pattern from redis-cache.test.ts)
    (cache as any).redis = mockRedis;
  });

  describe('getResponse', () => {
    it('should retrieve cached response', async () => {
      const query = 'React performance';
      const cachedResponse = { text: 'Found 3 articles...', toolCalls: [] };

      // RedisCache.get() does JSON.parse on the stored value
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedResponse));

      const result = await cache.getResponse(query);

      expect(result).toEqual(cachedResponse);
      expect(mockRedis.get).toHaveBeenCalledWith(
        `${NAMESPACE}:react performance`
      );
    });

    it('should return null if cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cache.getResponse('TypeScript');

      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Connection failed'));

      const result = await cache.getResponse('query');

      expect(result).toBeNull(); // Fail gracefully
    });
  });

  describe('setResponse', () => {
    it('should cache response with TTL', async () => {
      const query = 'React performance';
      const response = { text: 'Found 3 articles...', toolCalls: [] };

      await cache.setResponse(query, response);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `${NAMESPACE}:react performance`,
        60, // TTL
        JSON.stringify(response)
      );
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Write failed'));

      await expect(
        cache.setResponse('query', { text: 'response', toolCalls: [] })
      ).resolves.not.toThrow();
    });
  });

  describe('invalidateResponse', () => {
    it('should delete cache entry', async () => {
      const query = 'React';

      mockRedis.del.mockResolvedValue(1);

      await cache.invalidateResponse(query);

      expect(mockRedis.del).toHaveBeenCalledWith(`${NAMESPACE}:react`);
    });

    it('should handle errors gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Delete failed'));

      await expect(cache.invalidateResponse('query')).resolves.not.toThrow();
    });
  });

  describe('query normalization', () => {
    it('should normalize queries for cache keys', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ text: 'response', toolCalls: [] })
      );

      // All these should hit the same cache key
      await cache.getResponse('  React   Performance  ');
      await cache.getResponse('react performance');
      await cache.getResponse('REACT PERFORMANCE');
      await cache.getResponse('React Performance!');
      await cache.getResponse('React Performance?');

      // Verify all calls used the same normalized key
      const calls = mockRedis.get.mock.calls;
      const keys = calls.map((call: unknown[]) => call[0]);

      expect(new Set(keys).size).toBe(1);
      expect(keys[0]).toBe(`${NAMESPACE}:react performance`);
    });

    it('should remove Japanese punctuation', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ text: 'response', toolCalls: [] })
      );

      await cache.getResponse('最新のNext.js記事を教えて。');
      await cache.getResponse('最新のNextjs記事を教えて');

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

      await cache.getResponse('hit query');
      await cache.getResponse('miss query');

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe('backward compatibility', () => {
    it('should handle old string format from Redis', async () => {
      // Old entries stored as plain string
      mockRedis.get.mockResolvedValue(
        JSON.stringify('old plain text response')
      );

      const result = await cache.getResponse('test query');

      expect(result).toEqual({
        text: 'old plain text response',
        toolCalls: [],
      });
    });
  });

  describe('toolCalls preservation', () => {
    it('should preserve toolCalls through set/get cycle', async () => {
      const query = 'React hooks';
      const toolCalls = [
        {
          id: 'tc1',
          name: 'semantic-search',
          input: { query: 'react hooks' },
          output: [{ title: 'Article 1' }],
        },
      ];
      const response = { text: 'Found articles about React hooks', toolCalls };

      await cache.setResponse(query, response);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        60,
        JSON.stringify(response)
      );
    });
  });
});
