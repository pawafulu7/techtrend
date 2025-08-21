/**
 * /api/articles エンドポイントの包括的なテスト
 */

import { GET } from '@/app/api/articles/route';
import { prisma } from '@/lib/database';
import { getRedisClient } from '@/lib/redis/client';

// モックの設定
jest.mock('@/lib/database');
jest.mock('@/lib/redis/client');

const prismaMock = prisma as any;
const redisMock = getRedisClient() as any;

describe('/api/articles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // デフォルトのモック設定
    prismaMock.article = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    redisMock.get = jest.fn().mockResolvedValue(null);
    redisMock.set = jest.fn().mockResolvedValue('OK');
  });

  describe('GET', () => {
    const mockArticles = [
      {
        id: '1',
        title: 'Test Article 1',
        url: 'https://example.com/1',
        summary: 'Summary 1',
        publishedAt: new Date('2025-01-01'),
        qualityScore: 85,
        sourceId: 'qiita',
        source: {
          id: 'qiita',
          name: 'Qiita',
          type: 'api',
          url: 'https://qiita.com',
          enabled: true,
        },
        tags: [
          { id: 't1', name: 'React' },
          { id: 't2', name: 'TypeScript' },
        ],
        bookmarks: 10,
        userVotes: 5,
        difficulty: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        title: 'Test Article 2',
        url: 'https://example.com/2',
        summary: 'Summary 2',
        publishedAt: new Date('2025-01-02'),
        qualityScore: 90,
        sourceId: 'zenn',
        source: {
          id: 'zenn',
          name: 'Zenn',
          type: 'rss',
          url: 'https://zenn.dev',
          enabled: true,
        },
        tags: [
          { id: 't3', name: 'Node.js' },
        ],
        bookmarks: 20,
        userVotes: 10,
        difficulty: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('returns paginated articles with default parameters', async () => {
      prismaMock.article.findMany.mockResolvedValue(mockArticles);
      prismaMock.article.count.mockResolvedValue(2);

      const request = new Request('http://localhost:3000/api/articles');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        articles: mockArticles,
        total: 2,
        page: 1,
        limit: 20,
        hasMore: false,
      });

      // Prismaクエリのパラメータを確認
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 0,
          orderBy: { publishedAt: 'desc' },
          include: expect.objectContaining({
            source: true,
            tags: true,
          }),
        })
      );
    });

    it('handles pagination parameters correctly', async () => {
      prismaMock.article.findMany.mockResolvedValue([]);
      prismaMock.article.count.mockResolvedValue(100);

      const request = new Request('http://localhost:3000/api/articles?page=3&limit=10');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        page: 3,
        limit: 10,
        total: 100,
        hasMore: true,
      });

      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20, // (page - 1) * limit = (3 - 1) * 10
        })
      );
    });

    it('filters articles by source', async () => {
      prismaMock.article.findMany.mockResolvedValue([mockArticles[0]]);
      prismaMock.article.count.mockResolvedValue(1);

      const request = new Request('http://localhost:3000/api/articles?source=qiita');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.articles).toHaveLength(1);
      expect(data.articles[0].source.id).toBe('qiita');

      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceId: 'qiita',
          }),
        })
      );
    });

    it('filters articles by multiple sources', async () => {
      prismaMock.article.findMany.mockResolvedValue(mockArticles);
      prismaMock.article.count.mockResolvedValue(2);

      const request = new Request('http://localhost:3000/api/articles?sources=qiita,zenn');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceId: {
              in: ['qiita', 'zenn'],
            },
          }),
        })
      );
    });

    it('filters articles by tag', async () => {
      prismaMock.article.findMany.mockResolvedValue([mockArticles[0]]);
      prismaMock.article.count.mockResolvedValue(1);

      const request = new Request('http://localhost:3000/api/articles?tag=React');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tags: {
              some: {
                name: 'React',
              },
            },
          }),
        })
      );
    });

    it('handles search with single keyword', async () => {
      prismaMock.article.findMany.mockResolvedValue([mockArticles[0]]);
      prismaMock.article.count.mockResolvedValue(1);

      const request = new Request('http://localhost:3000/api/articles?q=React');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'React', mode: 'insensitive' } },
              { summary: { contains: 'React', mode: 'insensitive' } },
            ],
          }),
        })
      );
    });

    it('handles search with multiple keywords (AND search)', async () => {
      prismaMock.article.findMany.mockResolvedValue([mockArticles[0]]);
      prismaMock.article.count.mockResolvedValue(1);

      const request = new Request('http://localhost:3000/api/articles?q=React TypeScript');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [
              {
                OR: [
                  { title: { contains: 'React', mode: 'insensitive' } },
                  { summary: { contains: 'React', mode: 'insensitive' } },
                ],
              },
              {
                OR: [
                  { title: { contains: 'TypeScript', mode: 'insensitive' } },
                  { summary: { contains: 'TypeScript', mode: 'insensitive' } },
                ],
              },
            ],
          }),
        })
      );
    });

    it('sorts articles by different fields', async () => {
      prismaMock.article.findMany.mockResolvedValue(mockArticles);
      prismaMock.article.count.mockResolvedValue(2);

      // qualityScoreでソート
      const request = new Request('http://localhost:3000/api/articles?sortBy=qualityScore&sortOrder=desc');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { qualityScore: 'desc' },
        })
      );
    });

    it('uses cache when available', async () => {
      const cachedData = JSON.stringify({
        articles: mockArticles,
        total: 2,
        page: 1,
        limit: 20,
        hasMore: false,
      });
      redisMock.get.mockResolvedValue(cachedData);

      const request = new Request('http://localhost:3000/api/articles');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.articles).toEqual(mockArticles);
      
      // データベースは呼ばれない
      expect(prismaMock.article.findMany).not.toHaveBeenCalled();
      expect(prismaMock.article.count).not.toHaveBeenCalled();
    });

    it('sets cache after fetching from database', async () => {
      prismaMock.article.findMany.mockResolvedValue(mockArticles);
      prismaMock.article.count.mockResolvedValue(2);
      redisMock.get.mockResolvedValue(null);

      const request = new Request('http://localhost:3000/api/articles');
      await GET(request);

      // キャッシュが設定される
      expect(redisMock.set).toHaveBeenCalledWith(
        expect.any(String), // キャッシュキー
        expect.any(String), // JSON文字列
        'EX',
        expect.any(Number), // TTL
      );
    });

    it('handles database errors gracefully', async () => {
      prismaMock.article.findMany.mockRejectedValue(new Error('Database connection failed'));

      const request = new Request('http://localhost:3000/api/articles');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toMatchObject({
        error: expect.stringContaining('Failed to fetch articles'),
      });
    });

    it('validates limit parameter', async () => {
      prismaMock.article.findMany.mockResolvedValue([]);
      prismaMock.article.count.mockResolvedValue(0);

      // 不正なlimit値
      const request = new Request('http://localhost:3000/api/articles?limit=1000');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // limitは最大値に制限される
      expect(data.limit).toBeLessThanOrEqual(100);
    });

    it('handles empty search query', async () => {
      prismaMock.article.findMany.mockResolvedValue(mockArticles);
      prismaMock.article.count.mockResolvedValue(2);

      const request = new Request('http://localhost:3000/api/articles?q=');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // 空の検索クエリは無視される
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            OR: expect.anything(),
            AND: expect.anything(),
          }),
        })
      );
    });

    it('filters by date range', async () => {
      prismaMock.article.findMany.mockResolvedValue([mockArticles[0]]);
      prismaMock.article.count.mockResolvedValue(1);

      const from = '2025-01-01';
      const to = '2025-01-31';
      const request = new Request(`http://localhost:3000/api/articles?from=${from}&to=${to}`);
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            publishedAt: {
              gte: new Date(from),
              lte: new Date(to),
            },
          }),
        })
      );
    });
  });
});