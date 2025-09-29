import { GET } from '@/app/api/articles/route';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    article: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth/auth', () => ({
  auth: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@/lib/cache/layered-cache', () => ({
  LayeredCache: jest.fn().mockImplementation(() => ({
    getArticles: jest.fn().mockImplementation((_params, fetcher) => fetcher()),
  })),
}));

jest.mock('@/lib/cache/source-cache', () => ({
  sourceCache: {
    resolveSourceIds: jest.fn().mockImplementation((ids) => Promise.resolve(ids)),
  },
}));

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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when excludeUnprocessed is not specified (default false)', () => {
    it('should include all articles', async () => {
      (prisma.article.count as jest.Mock).mockResolvedValue(2);
      (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(2);
      expect(data.data.total).toBe(2);

      // Verify Prisma was called without summaryComputedAt filter
      const findManyCall = (prisma.article.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where.summaryComputedAt).toBeUndefined();
    });
  });

  describe('when excludeUnprocessed=true', () => {
    it('should exclude articles with null summaryComputedAt', async () => {
      const processedArticles = mockArticles.filter(a => a.summaryComputedAt !== null);
      (prisma.article.count as jest.Mock).mockResolvedValue(1);
      (prisma.article.findMany as jest.Mock).mockResolvedValue(processedArticles);

      const request = new NextRequest('http://localhost:3000/api/articles?excludeUnprocessed=true');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].id).toBe('1');
      expect(data.data.total).toBe(1);

      // Verify Prisma was called with summaryComputedAt filter
      const findManyCall = (prisma.article.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where.summaryComputedAt).toEqual({ not: null });
    });
  });

  describe('when excludeUnprocessed=false', () => {
    it('should include all articles', async () => {
      (prisma.article.count as jest.Mock).mockResolvedValue(2);
      (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

      const request = new NextRequest('http://localhost:3000/api/articles?excludeUnprocessed=false');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(2);
      expect(data.data.total).toBe(2);

      // Verify Prisma was called without summaryComputedAt filter
      const findManyCall = (prisma.article.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where.summaryComputedAt).toBeUndefined();
    });
  });

  describe('cache key generation', () => {
    it('should include excludeUnprocessed in cache key', async () => {
      (prisma.article.count as jest.Mock).mockResolvedValue(1);
      (prisma.article.findMany as jest.Mock).mockResolvedValue([mockArticles[0]]);

      const LayeredCache = require('@/lib/cache/layered-cache').LayeredCache;
      const mockGetArticles = jest.fn().mockImplementation((_params, fetcher) => fetcher());
      LayeredCache.mockImplementation(() => ({
        getArticles: mockGetArticles,
      }));

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