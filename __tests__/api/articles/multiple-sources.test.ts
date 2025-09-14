import { GET } from '@/app/api/articles/route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';
import { getRedisClient } from '@/lib/redis/client';

// Mock dependencies
jest.mock('@/lib/database');
jest.mock('@/lib/redis/client');
jest.mock('@/lib/cache/cache-invalidator');

// LayeredCacheを直接モック
jest.mock('@/lib/cache/layered-cache', () => ({
  LayeredCache: jest.fn().mockImplementation(() => ({
    getArticles: jest.fn(async (params, fetcher) => {
      return await fetcher();
    }),
    getOrFetch: jest.fn(async (key, fetcher) => {
      return await fetcher();
    }),
    set: jest.fn(),
    del: jest.fn(),
    clear: jest.fn(),
  })),
}));

jest.mock('@/lib/metrics/performance', () => ({
  MetricsCollector: jest.fn().mockImplementation(() => ({
    startTimer: jest.fn(),
    endTimer: jest.fn().mockReturnValue(10),
    setCacheStatus: jest.fn(),
    addMetricsToHeaders: jest.fn(),
  })),
  withDbTiming: jest.fn(async (metrics, fn) => await fn()),
  withCacheTiming: jest.fn(async (metrics, fn) => await fn()),
}));

const prismaMock = prisma as any;
const _redisMock = getRedisClient() as any;

describe('Multiple Sources Filter API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // デフォルトのモック設定
    prismaMock.article = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn(),
    };
    
    prismaMock.source = {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    };
    
    prismaMock.$disconnect = jest.fn();
    
    // Redisモックは自動的にリセットされる（RedisMockFactory経由）
  });

  describe('GET /api/articles with sources parameter', () => {
    const mockArticles = [
      {
        id: '1',
        title: 'Article from Source 1',
        url: 'https://example.com/1',
        summary: 'Summary 1',
        publishedAt: new Date('2025-01-01'),
        qualityScore: 85,
        sourceId: 'test-source-1',
        source: {
          id: 'test-source-1',
          name: 'Test Source 1',
          type: 'rss',
          url: 'https://test1.example.com',
          enabled: true,
        },
        tags: [],
      },
      {
        id: '2',
        title: 'Article from Source 2',
        url: 'https://example.com/2',
        summary: 'Summary 2',
        publishedAt: new Date('2025-01-02'),
        qualityScore: 90,
        sourceId: 'test-source-2',
        source: {
          id: 'test-source-2',
          name: 'Test Source 2',
          type: 'api',
          url: 'https://test2.example.com',
          enabled: true,
        },
        tags: [],
      },
    ];

    it('should fetch articles from multiple sources', async () => {
      const filteredArticles = mockArticles;
      prismaMock.article.findMany.mockResolvedValue(filteredArticles);
      prismaMock.article.count.mockResolvedValue(2);

      const request = new NextRequest('http://localhost:3000/api/articles?sources=test-source-1,test-source-2');
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('items');
      expect(Array.isArray(data.data.items)).toBe(true);
      expect(data.data.items).toHaveLength(2);
      
      // Verify Prisma was called with correct where clause
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceId: {
              in: ['test-source-1', 'test-source-2'],
            },
          }),
        })
      );
      
      // Verify all articles are from selected sources
      const selectedSourceIds = ['test-source-1', 'test-source-2'];
      data.data.items.forEach((article: any) => {
        expect(selectedSourceIds).toContain(article.sourceId);
      });
    });

    it('should return all articles when sources parameter is empty', async () => {
      prismaMock.article.findMany.mockResolvedValue(mockArticles);
      prismaMock.article.count.mockResolvedValue(2);

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('items');
      expect(data.data).toHaveProperty('total');
      
      // Should not have sourceId filter in where clause
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            sourceId: expect.anything(),
          }),
        })
      );
    });

    it('should handle non-existent source IDs gracefully', async () => {
      prismaMock.article.findMany.mockResolvedValue([]);
      prismaMock.article.count.mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/articles?sources=nonexistent1,nonexistent2');
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.items).toEqual([]);
      expect(data.data.total).toBe(0);
    });

    it('should maintain backward compatibility with sourceId parameter', async () => {
      const singleSourceArticle = [mockArticles[0]];
      prismaMock.article.findMany.mockResolvedValue(singleSourceArticle);
      prismaMock.article.count.mockResolvedValue(1);

      const request = new NextRequest('http://localhost:3000/api/articles?sourceId=test-source-1');
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      
      // Should use sourceId (not sources) in where clause
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceId: 'test-source-1',
          }),
        })
      );
      
      // All returned articles should be from the specified source
      if (data.data.items.length > 0) {
        data.data.items.forEach((article: any) => {
          expect(article.sourceId).toBe('test-source-1');
        });
      }
    });

    it('should combine multiple source filters with other filters', async () => {
      prismaMock.article.findMany.mockResolvedValue([]);
      prismaMock.article.count.mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/articles?sources=test-source-1,test-source-2&tag=React');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      
      // Should combine sourceId and tag filters
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceId: {
              in: ['test-source-1', 'test-source-2'],
            },
            tags: {
              some: {
                name: 'React',
              },
            },
          }),
        })
      );
    });

  });
});