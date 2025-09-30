// Mock dependencies MUST be first
jest.mock('@/lib/database');
jest.mock('@/lib/cache/cache-invalidator');

jest.mock('@/lib/auth/auth', () => ({
  auth: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/cache/layered-cache', () => {
  // Create the shared mock inside the jest.mock factory
  const mockGetArticles = jest.fn(async (params, fetcher) => {
    return await fetcher();
  });

  return {
    LayeredCache: jest.fn().mockImplementation(() => ({
      getArticles: mockGetArticles,
      getOrFetch: jest.fn(async (key, fetcher) => {
        return await fetcher();
      }),
      set: jest.fn(),
      del: jest.fn(),
      clear: jest.fn(),
    })),
    __mockGetArticles: mockGetArticles, // Export for testing
  };
});

jest.mock('@/lib/cache/source-cache', () => ({
  sourceCache: {
    resolveSourceIds: jest.fn().mockImplementation((ids) => Promise.resolve(ids)),
  },
}));

jest.mock('@/lib/dataloader', () => ({
  createLoaders: jest.fn(() => ({
    article: null,
    favorite: null,
    view: null,
  })),
}));

jest.mock('@/lib/metrics/performance', () => ({
  MetricsCollector: jest.fn().mockImplementation(() => ({
    startTimer: jest.fn(),
    endTimer: jest.fn().mockReturnValue(10),
    setCacheStatus: jest.fn(),
    addMetricsToHeaders: jest.fn((headers) => {
      headers.set('X-Cache-Status', 'HIT');
      headers.set('X-Response-Time', '10ms');
    }),
  })),
  withDbTiming: jest.fn(async (metrics, fn) => await fn()),
  withCacheTiming: jest.fn(async (metrics, fn) => await fn()),
}));

// Import after mocks
import { GET } from '@/app/api/articles/route';
import { prisma } from '@/lib/database';
import { NextRequest } from 'next/server';
import { __mockGetArticles } from '@/lib/cache/layered-cache';

const prismaMock = prisma as any;
const mockGetArticles = __mockGetArticles;

describe('excludeUnprocessed parameter', () => {
  const mockArticles = [
    {
      id: '1',
      title: 'Processed Article',
      url: 'https://example.com/1',
      summary: 'Summary 1',
      summaryComputedAt: new Date('2025-09-29T10:00:00Z'),
      thumbnail: null,
      publishedAt: new Date('2025-09-29T09:00:00Z'),
      qualityScore: 80,
      bookmarks: 5,
      userVotes: 10,
      difficulty: 3,
      createdAt: new Date('2025-09-29T08:00:00Z'),
      updatedAt: new Date('2025-09-29T10:00:00Z'),
      sourceId: 'source-1',
      summaryVersion: 7,
      articleType: 'tech',
      category: 'frontend',
      content: 'Content 1',
    },
    {
      id: '2',
      title: 'Unprocessed Article',
      url: 'https://example.com/2',
      summary: null,
      summaryComputedAt: null, // Not processed yet
      thumbnail: null,
      publishedAt: new Date('2025-09-29T09:30:00Z'),
      qualityScore: 75,
      bookmarks: 3,
      userVotes: 8,
      difficulty: 2,
      createdAt: new Date('2025-09-29T08:30:00Z'),
      updatedAt: new Date('2025-09-29T08:30:00Z'),
      sourceId: 'source-1',
      summaryVersion: 7,
      articleType: 'tech',
      category: 'backend',
      content: 'Content 2',
    },
  ];

  let LayeredCache: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Prismaモックのクリア
    if (prismaMock.article) {
      Object.values(prismaMock.article).forEach((fn: any) => {
        if (fn && fn.mockClear) fn.mockClear();
      });
    }

    // LayeredCacheモックのリセット
    LayeredCache = require('@/lib/cache/layered-cache').LayeredCache;
    LayeredCache.mockClear();
  });

  describe('when excludeUnprocessed is not specified (default false)', () => {
    it('should include all articles', async () => {
      prismaMock.article.count.mockResolvedValue(2);
      prismaMock.article.findMany.mockResolvedValue(mockArticles);

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(2);
      expect(data.data.total).toBe(2);

      // Verify Prisma was called without summaryComputedAt filter
      const findManyCall = prismaMock.article.findMany.mock.calls[0][0];
      expect(findManyCall.where.summaryComputedAt).toBeUndefined();
    });
  });

  describe('when excludeUnprocessed=true', () => {
    it('should exclude articles with null summaryComputedAt', async () => {
      const processedArticles = mockArticles.filter(a => a.summaryComputedAt !== null);
      prismaMock.article.count.mockResolvedValue(1);
      prismaMock.article.findMany.mockResolvedValue(processedArticles);

      const request = new NextRequest('http://localhost:3000/api/articles?excludeUnprocessed=true');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].id).toBe('1');
      expect(data.data.total).toBe(1);

      // Verify Prisma was called with summaryComputedAt filter
      const findManyCall = prismaMock.article.findMany.mock.calls[0][0];
      expect(findManyCall.where.summaryComputedAt).toEqual({ not: null });
    });
  });

  describe('when excludeUnprocessed=false', () => {
    it('should include all articles', async () => {
      prismaMock.article.count.mockResolvedValue(2);
      prismaMock.article.findMany.mockResolvedValue(mockArticles);

      const request = new NextRequest('http://localhost:3000/api/articles?excludeUnprocessed=false');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(2);
      expect(data.data.total).toBe(2);

      // Verify Prisma was called without summaryComputedAt filter
      const findManyCall = prismaMock.article.findMany.mock.calls[0][0];
      expect(findManyCall.where.summaryComputedAt).toBeUndefined();
    });
  });

  describe('cache key generation', () => {
    it('should include excludeUnprocessed in cache key', async () => {
      prismaMock.article.count.mockResolvedValue(1);
      prismaMock.article.findMany.mockResolvedValue([mockArticles[0]]);

      // Clear previous calls to mockGetArticles
      mockGetArticles.mockClear();

      const request1 = new NextRequest('http://localhost:3000/api/articles?excludeUnprocessed=true');
      await GET(request1);

      const request2 = new NextRequest('http://localhost:3000/api/articles?excludeUnprocessed=false');
      await GET(request2);

      // Verify cache was called with different parameters
      expect(mockGetArticles).toHaveBeenCalledTimes(2);
      const firstCallParams = mockGetArticles.mock.calls[0][0];
      const secondCallParams = mockGetArticles.mock.calls[1][0];

      expect(firstCallParams.excludeUnprocessed).toBe(true);
      expect(secondCallParams.excludeUnprocessed).toBe(false);
    });
  });
});