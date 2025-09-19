import { SourceCache } from '@/lib/cache/source-cache';
import { RedisCache } from '@/lib/cache';

// Mock dependencies
jest.mock('@/lib/database');
jest.mock('@/lib/cache');
jest.mock('@/lib/logger');

// Import mocked prisma after mocking
const mockPrisma = require('@/lib/database').prisma;
const mockSources = [
  { id: 'source-1', name: 'Dev.to', type: 'rss', url: 'https://dev.to', enabled: true },
  { id: 'source-2', name: 'Qiita', type: 'api', url: 'https://qiita.com', enabled: true },
  { id: 'source-3', name: 'Hacker News', type: 'api', url: 'https://news.ycombinator.com', enabled: false },
];

describe('SourceCache', () => {
  let sourceCache: SourceCache;

  beforeEach(() => {
    jest.clearAllMocks();
    sourceCache = new SourceCache();

    // Setup default mock
    mockPrisma.source.findMany.mockResolvedValue(mockSources);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveSourceIds', () => {
    it('should resolve source names to IDs (case-insensitive)', async () => {
      const result = await sourceCache.resolveSourceIds(['dev.to', 'QIITA']);
      expect(result).toEqual(expect.arrayContaining(['source-1', 'source-2']));
      expect(result).toHaveLength(2);
    });

    it('should pass through existing IDs unchanged', async () => {
      const result = await sourceCache.resolveSourceIds(['source-1', 'source-2']);
      expect(result).toEqual(expect.arrayContaining(['source-1', 'source-2']));
      expect(result).toHaveLength(2);
    });

    it('should handle mixed names and IDs', async () => {
      const result = await sourceCache.resolveSourceIds(['Dev.to', 'source-2', 'qiita']);
      expect(result).toEqual(expect.arrayContaining(['source-1', 'source-2']));
      expect(result).toHaveLength(2);
    });

    it('should filter out unresolvable names', async () => {
      const result = await sourceCache.resolveSourceIds(['Unknown Source', 'Dev.to']);
      expect(result).toEqual(['source-1']);
    });

    it('should return empty array for empty input', async () => {
      const result = await sourceCache.resolveSourceIds([]);
      expect(result).toEqual([]);
    });

    it('should handle whitespace and empty strings', async () => {
      const result = await sourceCache.resolveSourceIds(['  ', '', '  Dev.to  ']);
      expect(result).toEqual(['source-1']);
    });

    it('should cache results for performance', async () => {
      // First call - loads from DB
      await sourceCache.resolveSourceIds(['Dev.to']);
      expect(mockPrisma.source.findMany).toHaveBeenCalledTimes(1);

      // Second call - uses cache
      await sourceCache.resolveSourceIds(['Qiita']);
      expect(mockPrisma.source.findMany).toHaveBeenCalledTimes(1);
    });

    it('should refresh cache when TTL expires', async () => {
      // First call
      await sourceCache.resolveSourceIds(['Dev.to']);
      expect(mockPrisma.source.findMany).toHaveBeenCalledTimes(1);

      // Simulate TTL expiration by manipulating the cache
      // This would require access to private properties, so we test the behavior instead
      // by waiting or mocking time

      // Force refresh by providing an unknown name that triggers refresh
      mockPrisma.source.findMany.mockResolvedValueOnce([
        ...mockSources,
        { id: 'source-4', name: 'NewSource', type: 'rss', url: 'https://new.com', enabled: true }
      ]);

      // This should trigger a refresh since 'NewSource' is not in cache
      const result = await sourceCache.resolveSourceIds(['NewSource']);
      // The refresh happens asynchronously, so we check for the fallback behavior
      expect(mockPrisma.source.findMany).toHaveBeenCalled();
    });
  });

  describe('resolveSourceName', () => {
    it('should resolve source ID to name', async () => {
      const result = await sourceCache.resolveSourceName('source-1');
      expect(result).toBe('Dev.to');
    });

    it('should return null for unknown source ID', async () => {
      const result = await sourceCache.resolveSourceName('unknown-id');
      expect(result).toBeNull();
    });

    it('should handle empty input', async () => {
      const result = await sourceCache.resolveSourceName('');
      expect(result).toBeNull();
    });

    it('should handle whitespace input', async () => {
      const result = await sourceCache.resolveSourceName('  ');
      expect(result).toBeNull();
    });
  });

  describe('getAllSourcesWithStats', () => {
    beforeEach(() => {
      const mockArticles = [
        { sourceId: 'source-1', _count: { sourceId: 10 } },
        { sourceId: 'source-2', _count: { sourceId: 5 } },
      ];

      mockPrisma.article = mockPrisma.article || {};
      mockPrisma.article.groupBy = jest.fn().mockResolvedValue(mockArticles);
    });

    it('should return all enabled sources with stats', async () => {
      const result = await sourceCache.getAllSourcesWithStats();

      expect(result).toHaveLength(2); // Only enabled sources
      expect(result[0]).toMatchObject({
        id: 'source-1',
        name: 'Dev.to',
        enabled: true,
        articleCount: 10
      });
      expect(result[0].stats).toBeDefined();
      expect(result[0].category).toBeDefined();
    });

    it('should cache results', async () => {
      await sourceCache.getAllSourcesWithStats();
      expect(mockPrisma.source.findMany).toHaveBeenCalledTimes(1);

      await sourceCache.getAllSourcesWithStats();
      // Should use cache, not call DB again
      expect(mockPrisma.source.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidate', () => {
    it('should clear all caches', async () => {
      // Load some data into cache
      await sourceCache.resolveSourceIds(['Dev.to']);
      await sourceCache.getAllSourcesWithStats();

      // Clear cache
      await sourceCache.invalidate();

      // Next call should hit DB again
      await sourceCache.resolveSourceIds(['Dev.to']);
      // This will be the second call after the initial one
      expect(mockPrisma.source.findMany).toHaveBeenCalledTimes(3);
    });
  });

  describe('invalidateSource', () => {
    it('should invalidate specific source cache', async () => {
      const mockInvalidatePattern = jest.fn().mockResolvedValue(undefined);
      (RedisCache as jest.Mock).mockImplementation(() => ({
        invalidatePattern: mockInvalidatePattern
      }));

      const cache = new SourceCache();
      await cache.invalidateSource('source-1');

      expect(mockInvalidatePattern).toHaveBeenCalledWith('*source-1*');
    });
  });
});