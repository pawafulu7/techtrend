/**
 * /api/article-views エンドポイントのテスト
 */

// モックの設定
jest.mock('@/lib/prisma');
jest.mock('@/lib/auth/auth');

import { GET, POST, DELETE } from '@/app/api/article-views/route';
import { prisma } from '@/lib/prisma';
// モック関数は jest.mock によって自動的に __mocks__ から読み込まれる
import { auth } from '@/lib/auth/auth';
import { NextRequest } from 'next/server';

// モック関数のヘルパーを取得
const authMock = auth as jest.MockedFunction<typeof auth>;
const setUnauthenticated = () => authMock.mockResolvedValue(null);
const resetMockSession = () => authMock.mockResolvedValue({
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User'
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
});

const prismaMock = prisma as any;

describe('/api/article-views', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockSession();

    // $transactionのモック設定
    prismaMock.$transaction = jest.fn().mockImplementation(async (operations) => {
      if (typeof operations === 'function') {
        return operations(prismaMock);
      }
      return Promise.all(operations);
    });

    // デフォルトのPrismaモック設定
    prismaMock.articleView = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };

    prismaMock.article = {
      findUnique: jest.fn().mockResolvedValue(null),
    };
  });

  describe('GET', () => {
    const mockViews = [
      {
        id: 'view1',
        userId: 'test-user-id',
        articleId: 'article1',
        viewedAt: new Date('2025-01-01T10:00:00Z'),
        isRead: true,
        readAt: new Date('2025-01-01T10:00:00Z'),
        article: {
          id: 'article1',
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
          ],
        },
      },
      {
        id: 'view2',
        userId: 'test-user-id',
        articleId: 'article2',
        viewedAt: new Date('2025-01-02T10:00:00Z'),
        isRead: true,
        readAt: new Date('2025-01-02T10:00:00Z'),
        article: {
          id: 'article2',
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
            { id: 't2', name: 'Node.js' },
          ],
        },
      },
    ];

    it('認証済みユーザーの閲覧履歴を返す', async () => {
      prismaMock.articleView.findMany.mockResolvedValue(mockViews);
      prismaMock.articleView.count.mockResolvedValue(2);

      const request = new NextRequest('http://localhost/api/article-views');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.views).toHaveLength(2);
      expect(data.views[0].title).toBe('Test Article 1');
      expect(data.views[0].viewId).toBe('view1');
      expect(data.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });

      // 90日以内の履歴のみ取得することを確認
      expect(prismaMock.articleView.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'test-user-id',
            viewedAt: expect.objectContaining({
              gte: expect.any(Date),
            }),
          }),
        })
      );
    });

    it('ページネーションパラメータを正しく処理する', async () => {
      prismaMock.articleView.findMany.mockResolvedValue([mockViews[1]]);
      prismaMock.articleView.count.mockResolvedValue(50);

      const request = new NextRequest('http://localhost/api/article-views?page=2&limit=10');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 50,
        totalPages: 5,
      });

      expect(prismaMock.articleView.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        })
      );
    });

    it('未認証の場合401を返す', async () => {
      setUnauthenticated();

      const request = new NextRequest('http://localhost/api/article-views');
      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
      expect(prismaMock.articleView.findMany).not.toHaveBeenCalled();
    });

    it('空の閲覧履歴を返す', async () => {
      prismaMock.articleView.findMany.mockResolvedValue([]);
      prismaMock.articleView.count.mockResolvedValue(0);

      const request = new NextRequest('http://localhost/api/article-views');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.views).toHaveLength(0);
      expect(data.pagination.total).toBe(0);
    });
  });

  describe('POST', () => {
    const mockArticle = {
      id: 'article1',
      title: 'Test Article',
      url: 'https://example.com/article',
      summary: 'Test summary',
      publishedAt: new Date('2025-01-01'),
      sourceId: 'qiita',
    };

    const mockView = {
      id: 'view1',
      userId: 'test-user-id',
      articleId: 'article1',
      viewedAt: new Date('2025-01-01T10:00:00Z'),
      isRead: true,
      readAt: new Date('2025-01-01T10:00:00Z'),
    };

    it('新規記事閲覧を記録する', async () => {
      prismaMock.article.findUnique.mockResolvedValue(mockArticle);
      prismaMock.articleView.findFirst.mockResolvedValue(null);
      prismaMock.articleView.create.mockResolvedValue(mockView);
      prismaMock.articleView.count.mockResolvedValue(50);

      const request = new NextRequest('http://localhost/api/article-views', {
        method: 'POST',
        body: JSON.stringify({ articleId: 'article1' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.message).toBe('Article view recorded');
      expect(data.viewId).toBe('view1');

      expect(prismaMock.article.findUnique).toHaveBeenCalledWith({
        where: { id: 'article1' },
      });
      expect(prismaMock.articleView.create).toHaveBeenCalledWith({
        data: {
          userId: 'test-user-id',
          articleId: 'article1',
          viewedAt: expect.any(Date),
          isRead: true,
          readAt: expect.any(Date),
        },
      });
    });

    it('既存の閲覧記録がある場合は更新する', async () => {
      const existingView = {
        id: 'existing-view',
        userId: 'test-user-id',
        articleId: 'article1',
        viewedAt: new Date('2025-01-01T08:00:00Z'),
        isRead: false,
        readAt: null,
      };

      const updatedView = {
        ...existingView,
        viewedAt: new Date('2025-01-01T10:00:00Z'),
        isRead: true,
        readAt: new Date('2025-01-01T10:00:00Z'),
      };

      prismaMock.article.findUnique.mockResolvedValue(mockArticle);
      prismaMock.articleView.findFirst.mockResolvedValue(existingView);
      prismaMock.articleView.update.mockResolvedValue(updatedView);
      prismaMock.articleView.count.mockResolvedValue(50);

      const request = new NextRequest('http://localhost/api/article-views', {
        method: 'POST',
        body: JSON.stringify({ articleId: 'article1' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.message).toBe('View timestamp updated');
      expect(data.viewId).toBe('existing-view');

      expect(prismaMock.articleView.update).toHaveBeenCalledWith({
        where: { id: 'existing-view' },
        data: {
          viewedAt: expect.any(Date),
          isRead: true,
          readAt: expect.any(Date),
        },
      });
      expect(prismaMock.articleView.create).not.toHaveBeenCalled();
    });

    it('100件を超える履歴の場合、古い履歴のviewedAtをnullに更新する', async () => {
      prismaMock.article.findUnique.mockResolvedValue(mockArticle);
      prismaMock.articleView.findFirst.mockResolvedValue(null);
      prismaMock.articleView.create.mockResolvedValue(mockView);
      prismaMock.articleView.count.mockResolvedValue(101);
      
      // 最新100件のIDを返す
      const recentViews = Array.from({ length: 100 }, (_, i) => ({ id: `view-${i}` }));
      prismaMock.articleView.findMany.mockResolvedValue(recentViews);

      const request = new NextRequest('http://localhost/api/article-views', {
        method: 'POST',
        body: JSON.stringify({ articleId: 'article1' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);

      // viewedAtをnullに更新（削除ではない）
      expect(prismaMock.articleView.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'test-user-id',
          viewedAt: { not: null },
          id: { notIn: recentViews.map(v => v.id) },
        },
        data: {
          viewedAt: null,
        },
      });
    });

    it('articleIdが無い場合400を返す', async () => {
      const request = new NextRequest('http://localhost/api/article-views', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Article ID is required');
      expect(prismaMock.articleView.create).not.toHaveBeenCalled();
    });

    it('記事が存在しない場合404を返す', async () => {
      prismaMock.article.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/article-views', {
        method: 'POST',
        body: JSON.stringify({ articleId: 'nonexistent' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Article not found');
      expect(prismaMock.articleView.create).not.toHaveBeenCalled();
    });

    it('未認証の場合でも記録はしないが200を返す', async () => {
      setUnauthenticated();

      const request = new NextRequest('http://localhost/api/article-views', {
        method: 'POST',
        body: JSON.stringify({ articleId: 'article1' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('View not recorded (not logged in)');
      expect(prismaMock.articleView.create).not.toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('閲覧履歴をクリアする（viewedAtがnullでないもののみ）', async () => {
      prismaMock.articleView.deleteMany.mockResolvedValue({ count: 10 });

      const request = new NextRequest('http://localhost/api/article-views');
      const response = await DELETE(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('View history cleared');
      expect(data.clearedCount).toBe(10);

      expect(prismaMock.articleView.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'test-user-id',
          viewedAt: { not: null },
        },
      });
    });

    it('未認証の場合401を返す', async () => {
      setUnauthenticated();

      const request = new NextRequest('http://localhost/api/article-views');
      const response = await DELETE(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
      expect(prismaMock.articleView.deleteMany).not.toHaveBeenCalled();
    });

    it('削除対象がない場合でも成功を返す', async () => {
      prismaMock.articleView.deleteMany.mockResolvedValue({ count: 0 });

      const request = new NextRequest('http://localhost/api/article-views');
      const response = await DELETE(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('View history cleared');
      expect(data.clearedCount).toBe(0);
    });
  });
});