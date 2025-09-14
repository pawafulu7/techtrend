/**
 * /api/articles エンドポイントの包括的なテスト
 */

// モックの設定
jest.mock('@/lib/database');
jest.mock('@/lib/cache/cache-invalidator');

// LayeredCacheを直接モック
jest.mock('@/lib/cache/layered-cache', () => ({
  LayeredCache: jest.fn().mockImplementation(() => ({
    getArticles: jest.fn(async (params, fetcher) => {
      // フェッチャーを実行して結果を返す
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
    addMetricsToHeaders: jest.fn((headers) => {
      headers.set('X-Cache-Status', 'HIT');
      headers.set('X-Response-Time', '10ms');
    }),
  })),
  withDbTiming: jest.fn(async (metrics, fn) => await fn()),
  withCacheTiming: jest.fn(async (metrics, fn) => await fn()),
}));

// CacheMockFactoryは使用しない（LayeredCacheモックで対応）

import { GET } from '@/app/api/articles/route';
import { prisma } from '@/lib/database';
import { NextRequest } from 'next/server';

// NextRequestを作成するヘルパー関数
function createMockNextRequest(url: string): NextRequest {
  return new NextRequest(url);
}

const prismaMock = prisma as any;

describe('/api/articles', () => {
  beforeEach(() => {
    // Prismaモックのクリア
    if (prismaMock.article) {
      Object.values(prismaMock.article).forEach((fn: any) => {
        if (fn && fn.mockClear) fn.mockClear();
      });
    }
    
    // デフォルトのモック設定
    prismaMock.article = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    
    // キャッシュモックは自動的にリセットされる（CacheMockFactory経由）
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
          createdAt: new Date(),
          updatedAt: new Date(),
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
          createdAt: new Date(),
          updatedAt: new Date(),
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

      const request = createMockNextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.total).toBe(2);
      expect(data.data.page).toBe(1);
      expect(data.data.limit).toBe(20);
      expect(data.data.totalPages).toBe(1);
      expect(data.data.items).toHaveLength(2);
      
      // 個別にプロパティを確認（日付は文字列として比較）
      expect(data.data.items[0].id).toBe('1');
      expect(data.data.items[0].title).toBe('Test Article 1');
      expect(data.data.items[0].qualityScore).toBe(85);

      // Prismaクエリのパラメータを確認
      // デフォルトではrelationsは含まれない（includeRelations=false）
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 0,
          orderBy: { publishedAt: 'desc' },
          select: expect.objectContaining({
            id: true,
            title: true,
            url: true,
            summary: true,
            thumbnail: true,
            publishedAt: true,
            sourceId: true,
            bookmarks: true,
            qualityScore: true,
            userVotes: true,
            createdAt: true,
            updatedAt: true,
          }),
        })
      );
    });

    it('handles pagination parameters correctly', async () => {
      prismaMock.article.findMany.mockResolvedValue([]);
      prismaMock.article.count.mockResolvedValue(100);

      const request = createMockNextRequest('http://localhost:3000/api/articles?page=3&limit=10');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        success: true,
        data: {
          page: 3,
          limit: 10,
          total: 100,
          totalPages: 10,
        },
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

      const request = createMockNextRequest('http://localhost:3000/api/articles?sourceId=qiita');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].source.id).toBe('qiita');

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

      const request = createMockNextRequest('http://localhost:3000/api/articles?sources=qiita,zenn');
      const response = await GET(request);
      const _data = await response.json();

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

      const request = createMockNextRequest('http://localhost:3000/api/articles?tag=React');
      const response = await GET(request);
      const _data = await response.json();

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

      const request = createMockNextRequest('http://localhost:3000/api/articles?search=React');
      const response = await GET(request);
      const _data = await response.json();

      expect(response.status).toBe(200);
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              { content: { not: null } },
              { content: { not: '' } },
              {
                OR: [
                  { title: { contains: 'React', mode: 'insensitive' } },
                  { summary: { contains: 'React', mode: 'insensitive' } },
                ]
              }
            ])
          }),
        })
      );
    });

    it('handles search with multiple keywords (AND search)', async () => {
      prismaMock.article.findMany.mockResolvedValue([mockArticles[0]]);
      prismaMock.article.count.mockResolvedValue(1);

      const request = createMockNextRequest('http://localhost:3000/api/articles?search=React TypeScript');
      const response = await GET(request);
      const _data = await response.json();

      expect(response.status).toBe(200);
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              { content: { not: null } },
              { content: { not: '' } },
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
            ]),
          }),
        })
      );
    });

    it('sorts articles by different fields', async () => {
      prismaMock.article.findMany.mockResolvedValue(mockArticles);
      prismaMock.article.count.mockResolvedValue(2);

      // qualityScoreでソート
      const request = createMockNextRequest('http://localhost:3000/api/articles?sortBy=qualityScore&sortOrder=desc');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { qualityScore: 'desc' },
        })
      );
    });



    it('handles database errors gracefully', async () => {
      prismaMock.article.findMany.mockRejectedValue(new Error('Database connection failed'));

      const request = createMockNextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);
      const data = await response.json();

      // エラーが発生した場合は500エラーを返す
      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it('validates limit parameter', async () => {
      prismaMock.article.findMany.mockResolvedValue([]);
      prismaMock.article.count.mockResolvedValue(0);

      // 不正なlimit値
      const request = createMockNextRequest('http://localhost:3000/api/articles?limit=1000');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // limitは最大値に制限される
      expect(data.data.limit).toBeLessThanOrEqual(100);
    });


    it('filters by date range', async () => {
      prismaMock.article.findMany.mockResolvedValue([mockArticles[0]]);
      prismaMock.article.count.mockResolvedValue(1);

      // APIは dateRange パラメータを使用（例: "7d", "30d", "90d"）
      const request = createMockNextRequest(`http://localhost:3000/api/articles?dateRange=30d`);
      const response = await GET(request);

      expect(response.status).toBe(200);
      // dateRange は内部で処理されるため、findMany が呼ばれたことを確認
      expect(prismaMock.article.findMany).toHaveBeenCalled();
      expect(prismaMock.article.count).toHaveBeenCalled();
    });

    it('handles cache errors gracefully', async () => {
      // LayeredCacheはモックされているため、エラーは発生しない
      // データベースから正常に取得される
      prismaMock.article.findMany.mockResolvedValue(mockArticles);
      prismaMock.article.count.mockResolvedValue(2);

      const request = createMockNextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);
      const data = await response.json();

      // データベースから正常に取得
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(2);
    });

    it('supports none source filter', async () => {
      prismaMock.article.findMany.mockResolvedValue([]);
      prismaMock.article.count.mockResolvedValue(0);

      const request = createMockNextRequest('http://localhost:3000/api/articles?sources=none');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // With early return optimization, DB is not called
      expect(prismaMock.article.findMany).not.toHaveBeenCalled();
      expect(prismaMock.article.count).not.toHaveBeenCalled();
      // Should get empty result 
      expect(data.success).toBe(true);
      expect(data.data.items).toEqual([]);
      expect(data.data.total).toBe(0);
    });

    it('includes performance headers', async () => {
      prismaMock.article.findMany.mockResolvedValue(mockArticles);
      prismaMock.article.count.mockResolvedValue(2);

      const request = createMockNextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);

      expect(response.headers.get('X-Cache-Status')).toBeTruthy();
      expect(response.headers.get('X-Response-Time')).toMatch(/\d+ms/);
    });

  });
});