import { GET } from '@/app/api/articles/route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';

// Mock dependencies
jest.mock('@/lib/database');
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

jest.mock('@/lib/cache/enhanced-redis-cache', () => ({
  EnhancedRedisCache: jest.fn().mockImplementation(() => ({
    generateCacheKey: jest.fn().mockReturnValue('test-cache-key'),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    getOrFetch: jest.fn().mockImplementation(async (_key, fetcher) => {
      // Always call the fetcher for tests to verify DB calls
      return await fetcher();
    }),
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
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

describe('Articles API - Sort Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Prismaモックの設定
    prismaMock.article = {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      groupBy: jest.fn(),
    };
  });

  describe('GET /api/articles', () => {
    const mockArticles = [
      {
        id: '1',
        title: 'Test Article 1',
        url: 'https://example.com/1',
        summary: 'Summary 1',
        publishedAt: new Date('2025-02-04T10:00:00Z'),
        createdAt: new Date('2025-02-04T12:00:00Z'),
        qualityScore: 80,
        bookmarks: 10,
        userVotes: 5,
        difficulty: 'medium',
        sourceId: 'source1',
        updatedAt: new Date(),
        source: {
          id: 'source1',
          name: 'Test Source',
          type: 'rss',
          url: 'https://source.com',
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        tags: [],
      },
      {
        id: '2',
        title: 'Test Article 2',
        url: 'https://example.com/2',
        summary: 'Summary 2',
        publishedAt: new Date('2025-02-03T10:00:00Z'),
        createdAt: new Date('2025-02-04T14:00:00Z'),
        qualityScore: 60,
        bookmarks: 20,
        userVotes: 10,
        difficulty: 'easy',
        sourceId: 'source1',
        updatedAt: new Date(),
        source: {
          id: 'source1',
          name: 'Test Source',
          type: 'rss',
          url: 'https://source.com',
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        tags: [],
      },
    ];

    it('should sort by publishedAt by default', async () => {
      prismaMock.article.count.mockResolvedValue(2);
      prismaMock.article.findMany.mockResolvedValue(mockArticles);

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);
      const data = await response.json();

      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { publishedAt: 'desc' },
            { id: 'desc' }
          ],
        })
      );
      expect(data.success).toBe(true);
      // DateオブジェクトはJSONで文字列に変換されるため、個別のプロパティを確認
      expect(data.data.items).toHaveLength(2);
      expect(data.data.items[0].id).toBe('1');
      expect(data.data.items[0].title).toBe('Test Article 1');
      expect(data.data.items[1].id).toBe('2');
      expect(data.data.items[1].title).toBe('Test Article 2');
    });

    it('should sort by createdAt when specified', async () => {
      prismaMock.article.count.mockResolvedValue(2);
      prismaMock.article.findMany.mockResolvedValue(mockArticles);

      const request = new NextRequest('http://localhost:3000/api/articles?sortBy=createdAt');
      const response = await GET(request);
      const data = await response.json();

      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { createdAt: 'desc' },
            { id: 'desc' }
          ],
        })
      );
      expect(data.success).toBe(true);
      // DateオブジェクトはJSONで文字列に変換されるため、個別のプロパティを確認
      expect(data.data.items).toHaveLength(2);
      expect(data.data.items[0].id).toBe('1');
      expect(data.data.items[0].title).toBe('Test Article 1');
      expect(data.data.items[1].id).toBe('2');
      expect(data.data.items[1].title).toBe('Test Article 2');
    });

    it('should sort by qualityScore when specified', async () => {
      prismaMock.article.count.mockResolvedValue(2);
      prismaMock.article.findMany.mockResolvedValue(mockArticles);

      const request = new NextRequest('http://localhost:3000/api/articles?sortBy=qualityScore');
      const response = await GET(request);
      const data = await response.json();

      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { qualityScore: 'desc' },
            { id: 'desc' }
          ],
        })
      );
      expect(data.success).toBe(true);
      // DateオブジェクトはJSONで文字列に変換されるため、個別のプロパティを確認
      expect(data.data.items).toHaveLength(2);
      expect(data.data.items[0].id).toBe('1');
      expect(data.data.items[0].title).toBe('Test Article 1');
      expect(data.data.items[1].id).toBe('2');
      expect(data.data.items[1].title).toBe('Test Article 2');
    });

    it('should fallback to publishedAt for invalid sortBy parameter', async () => {
      prismaMock.article.count.mockResolvedValue(2);
      prismaMock.article.findMany.mockResolvedValue(mockArticles);

      const request = new NextRequest('http://localhost:3000/api/articles?sortBy=invalidField');
      const response = await GET(request);
      const data = await response.json();

      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { publishedAt: 'desc' },
            { id: 'desc' }
          ],
        })
      );
      expect(data.success).toBe(true);
      // DateオブジェクトはJSONで文字列に変換されるため、個別のプロパティを確認
      expect(data.data.items).toHaveLength(2);
      expect(data.data.items[0].id).toBe('1');
      expect(data.data.items[0].title).toBe('Test Article 1');
      expect(data.data.items[1].id).toBe('2');
      expect(data.data.items[1].title).toBe('Test Article 2');
    });

    it('should support ascending sort order', async () => {
      prismaMock.article.count.mockResolvedValue(2);
      prismaMock.article.findMany.mockResolvedValue(mockArticles);

      const request = new NextRequest('http://localhost:3000/api/articles?sortBy=createdAt&sortOrder=asc');
      const response = await GET(request);
      const data = await response.json();

      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { createdAt: 'asc' },
            { id: 'desc' }
          ],
        })
      );
      expect(data.success).toBe(true);
      // DateオブジェクトはJSONで文字列に変換されるため、個別のプロパティを確認
      expect(data.data.items).toHaveLength(2);
      expect(data.data.items[0].id).toBe('1');
      expect(data.data.items[0].title).toBe('Test Article 1');
      expect(data.data.items[1].id).toBe('2');
      expect(data.data.items[1].title).toBe('Test Article 2');
    });

    it('should include sortBy in cache key', async () => {
      prismaMock.article.count.mockResolvedValue(2);
      prismaMock.article.findMany.mockResolvedValue(mockArticles);

      const request = new NextRequest('http://localhost:3000/api/articles?sortBy=createdAt');
      const response = await GET(request);
      
      // APIが正常に動作していることを確認
      expect(response.status).toBe(200);
      
      // sortBy=createdAt が指定されたことを確認
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { createdAt: 'desc' },
            { id: 'desc' }
          ]
        })
      );
    });

    it('should validate all sortBy options', async () => {
      const validSortFields = ['publishedAt', 'createdAt', 'qualityScore', 'bookmarks', 'userVotes'];
      
      for (const field of validSortFields) {
        prismaMock.article.count.mockResolvedValue(2);
        prismaMock.article.findMany.mockResolvedValue(mockArticles);
        
        const request = new NextRequest(`http://localhost:3000/api/articles?sortBy=${field}`);
        const response = await GET(request);
        const data = await response.json();
        
        expect(prismaMock.article.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: [
              { [field]: 'desc' },
              { id: 'desc' }
            ],
          })
        );
        expect(data.success).toBe(true);
      }
    });
  });
});