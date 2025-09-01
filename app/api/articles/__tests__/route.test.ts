import { NextRequest } from 'next/server';
import { GET } from '../route';
import { createMockArticleWithRelations, resetMockCounters } from '@/test/utils/mock-factories';

// Prismaのモック
jest.mock('@/lib/database', () => ({
  prisma: {
    article: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

// Redisキャッシュのモック
jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    invalidate: jest.fn().mockResolvedValue(undefined),
  })),
}));

// 認証のモック
jest.mock('@/lib/auth/auth', () => ({
  auth: jest.fn().mockResolvedValue(null),
}));

// ロガーのモック
jest.mock('@/lib/logger', () => ({
  log: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('GET /api/articles', () => {
  const { prisma } = require('@/lib/database');
  
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockCounters();
  });

  describe('基本的な記事取得', () => {
    it('デフォルトパラメータで記事一覧を取得できる', async () => {
      const mockArticles = [
        createMockArticleWithRelations(),
        createMockArticleWithRelations(),
        createMockArticleWithRelations(),
      ];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(3);

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.articles).toHaveLength(3);
      expect(data.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 3,
        totalPages: 1,
      });
      
      // Prismaが正しいパラメータで呼ばれたか確認
      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
          orderBy: { publishedAt: 'desc' },
          include: {
            tags: true,
            source: true,
          },
        })
      );
    });

    it('ページネーションパラメータが正しく動作する', async () => {
      const mockArticles = [];
      for (let i = 0; i < 5; i++) {
        mockArticles.push(createMockArticleWithRelations());
      }
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(50);

      const request = new NextRequest('http://localhost:3000/api/articles?page=2&limit=5');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.articles).toHaveLength(5);
      expect(data.pagination).toEqual({
        page: 2,
        limit: 5,
        total: 50,
        totalPages: 10,
      });
      
      // skip計算が正しいか確認
      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5, // (page - 1) * limit = (2 - 1) * 5 = 5
          take: 5,
        })
      );
    });
  });

  describe('フィルタリング', () => {
    it('ソースIDでフィルタリングできる', async () => {
      const mockArticles = [
        createMockArticleWithRelations({ source: { id: 'source-1' } }),
      ];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(1);

      const request = new NextRequest('http://localhost:3000/api/articles?sourceId=source-1');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.articles).toHaveLength(1);
      
      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceId: 'source-1',
          }),
        })
      );
    });

    it('複数のソースでフィルタリングできる', async () => {
      const mockArticles = [
        createMockArticleWithRelations({ source: { id: 'source-1' } }),
        createMockArticleWithRelations({ source: { id: 'source-2' } }),
      ];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(2);

      const request = new NextRequest('http://localhost:3000/api/articles?sources=source-1,source-2');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.articles).toHaveLength(2);
      
      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceId: { in: ['source-1', 'source-2'] },
          }),
        })
      );
    });

    it('タグでフィルタリングできる', async () => {
      const mockArticles = [
        createMockArticleWithRelations({
          tags: [{ name: 'javascript', displayName: 'JavaScript' }],
        }),
      ];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(1);

      const request = new NextRequest('http://localhost:3000/api/articles?tag=javascript');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.articles).toHaveLength(1);
      
      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tags: {
              some: {
                OR: [
                  { name: { contains: 'javascript', mode: 'insensitive' } },
                  { displayName: { contains: 'javascript', mode: 'insensitive' } },
                ],
              },
            },
          }),
        })
      );
    });

    it('検索キーワードでフィルタリングできる', async () => {
      const mockArticles = [
        createMockArticleWithRelations({
          article: {
            title: 'React Testing Best Practices',
            summary: 'Learn how to test React components effectively',
          },
        }),
      ];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(1);

      const request = new NextRequest('http://localhost:3000/api/articles?search=React');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.articles).toHaveLength(1);
      
      expect(prisma.article.findMany).toHaveBeenCalledWith(
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

    it('複数のキーワードでAND検索ができる', async () => {
      const mockArticles = [
        createMockArticleWithRelations({
          article: {
            title: 'React Testing with TypeScript',
            summary: 'Complete guide for TypeScript React testing',
          },
        }),
      ];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(1);

      const request = new NextRequest('http://localhost:3000/api/articles?search=React TypeScript');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.articles).toHaveLength(1);
      
      // 複数キーワードのAND条件が適用されているか確認
      expect(prisma.article.findMany).toHaveBeenCalledWith(
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
  });

  describe('ソート', () => {
    it('publishedAtでソートできる', async () => {
      const mockArticles = [
        createMockArticleWithRelations(),
        createMockArticleWithRelations(),
      ];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(2);

      const request = new NextRequest('http://localhost:3000/api/articles?sortBy=publishedAt&sortOrder=asc');
      const response = await GET(request);

      expect(response.status).toBe(200);
      
      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { publishedAt: 'asc' },
        })
      );
    });

    it('createdAtでソートできる', async () => {
      const mockArticles = [
        createMockArticleWithRelations(),
        createMockArticleWithRelations(),
      ];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(2);

      const request = new NextRequest('http://localhost:3000/api/articles?sortBy=createdAt&sortOrder=desc');
      const response = await GET(request);

      expect(response.status).toBe(200);
      
      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('不正なソートフィールドはデフォルトにフォールバックする', async () => {
      const mockArticles = [createMockArticleWithRelations()];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(1);

      const request = new NextRequest('http://localhost:3000/api/articles?sortBy=invalid');
      const response = await GET(request);

      expect(response.status).toBe(200);
      
      // デフォルトのpublishedAt descにフォールバック
      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { publishedAt: 'desc' },
        })
      );
    });
  });

  describe('エラーハンドリング', () => {
    it('データベースエラーを適切に処理する', async () => {
      prisma.article.findMany.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeDefined();
      expect(data.error.message).toContain('Database operation failed');
    });

    it('不正なページ番号を処理する', async () => {
      const mockArticles = [];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/articles?page=-1');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination.page).toBe(1); // 負の値は1にクランプされる
    });

    it('過大なlimitを処理する', async () => {
      const mockArticles = [];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/articles?limit=1000');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination.limit).toBe(100); // 最大100にクランプされる
      
      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });
  });

  describe('キャッシュ動作', () => {
    it('キャッシュヒット時はDBクエリをスキップする', async () => {
      const { RedisCache } = require('@/lib/cache');
      const mockCache = {
        get: jest.fn().mockResolvedValue({
          articles: [createMockArticleWithRelations()],
          pagination: {
            page: 1,
            limit: 20,
            total: 1,
            totalPages: 1,
          },
        }),
        set: jest.fn(),
      };
      
      RedisCache.mockImplementation(() => mockCache);

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.articles).toHaveLength(1);
      
      // DBクエリが呼ばれていないことを確認
      expect(prisma.article.findMany).not.toHaveBeenCalled();
      expect(prisma.article.count).not.toHaveBeenCalled();
    });

    it('キャッシュミス時はDBから取得してキャッシュに保存する', async () => {
      const { RedisCache } = require('@/lib/cache');
      const mockCache = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
      };
      
      RedisCache.mockImplementation(() => mockCache);

      const mockArticles = [createMockArticleWithRelations()];
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(1);

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);

      expect(response.status).toBe(200);
      
      // DBクエリが呼ばれたことを確認
      expect(prisma.article.findMany).toHaveBeenCalled();
      expect(prisma.article.count).toHaveBeenCalled();
      
      // キャッシュに保存されたことを確認
      expect(mockCache.set).toHaveBeenCalled();
    });
  });
});