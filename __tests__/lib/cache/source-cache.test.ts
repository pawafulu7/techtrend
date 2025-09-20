import { SourceCache } from '@/lib/cache/source-cache';
jest.mock('@/lib/logger');

const { prisma, resetPrismaMock } = require('@/lib/database');

const createCacheStub = () => {
  const store = new Map<string, unknown>();

  return {
    getOrSet: jest.fn(async (key: string, fetcher: () => Promise<unknown>) => {
      if (store.has(key)) {
        return store.get(key);
      }
      const value = await fetcher();
      store.set(key, value);
      return value;
    }),
    invalidatePattern: jest.fn(async () => {
      store.clear();
    }),
    delete: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
};

const now = new Date();
const mockSources = [
  {
    id: 'source-1',
    name: 'Dev.to',
    type: 'rss',
    url: 'https://dev.to',
    enabled: true,
    _count: { articles: 2 },
    articles: [
      { qualityScore: 80, publishedAt: now, tags: [{ name: 'js' }] },
      { qualityScore: 60, publishedAt: now, tags: [{ name: 'ts' }] }
    ]
  },
  {
    id: 'source-2',
    name: 'Qiita',
    type: 'api',
    url: 'https://qiita.com',
    enabled: true,
    _count: { articles: 1 },
    articles: [
      { qualityScore: 70, publishedAt: now, tags: [{ name: 'dev' }] }
    ]
  },
  {
    id: 'source-3',
    name: 'Hacker News',
    type: 'api',
    url: 'https://news.ycombinator.com',
    enabled: false,
    _count: { articles: 0 },
    articles: []
  },
];

describe('SourceCache', () => {
  let sourceCache: SourceCache;
  let cacheStub: ReturnType<typeof createCacheStub>;

  beforeEach(() => {
    jest.clearAllMocks();
    resetPrismaMock();
    sourceCache = new SourceCache();
    cacheStub = createCacheStub();
    (sourceCache as any).cache = cacheStub;

    prisma.source.findMany.mockImplementation(async (params?: { where?: { enabled?: boolean } }) => {
      if (params?.where?.enabled === true) {
        return mockSources.filter((source) => source.enabled);
      }
      return mockSources;
    });
    prisma.source.findUnique?.mockResolvedValue(mockSources[0] as any);
    prisma.source.findFirst?.mockResolvedValue(mockSources[0] as any);
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
      await sourceCache.resolveSourceIds(['Dev.to']);
      expect(prisma.source.findMany).toHaveBeenCalledTimes(1);

      await sourceCache.resolveSourceIds(['Qiita']);
      expect(prisma.source.findMany).toHaveBeenCalledTimes(1);
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
    it('should return all enabled sources with stats', async () => {
      const result = await sourceCache.getAllSourcesWithStats();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'source-1',
        name: 'Dev.to',
        enabled: true,
      });
      expect(result[0].stats).toMatchObject({ totalArticles: 2 });
      expect(result[0].category).toBeDefined();
    });

    it('should cache results', async () => {
      await sourceCache.getAllSourcesWithStats();
      expect(prisma.source.findMany).toHaveBeenCalledTimes(1);

      await sourceCache.getAllSourcesWithStats();
      expect(prisma.source.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidate', () => {
    it('should clear all caches', async () => {
      await sourceCache.resolveSourceIds(['Dev.to']);
      await sourceCache.getAllSourcesWithStats();

      await sourceCache.invalidate();

      await sourceCache.resolveSourceIds(['Dev.to']);
      expect(prisma.source.findMany).toHaveBeenCalledTimes(3);
    });
  });

  describe('invalidateSource', () => {
    it('should invalidate specific source cache', async () => {
      const cache = new SourceCache();
      const localStub = createCacheStub();
      (cache as any).cache = localStub;

      await cache.invalidateSource('source-1');

      expect(localStub.delete).toHaveBeenCalledWith('source:source-1');
      expect(localStub.invalidatePattern).toHaveBeenCalledWith('*');
    });
  });
});
