/**
 * /api/favorites エンドポイントのテスト
 */

// モックの設定
jest.mock('@/lib/prisma');
jest.mock('@/lib/auth/auth');

import { GET, POST, DELETE } from '@/app/api/favorites/route';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth/auth';
import { NextRequest } from 'next/server';

// モック関数のヘルパーを取得
const prismaMock = prisma as any;
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

describe('/api/favorites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockSession();

    // モックのリセット
    prismaMock.favorite.findMany.mockResolvedValue([]);
    prismaMock.favorite.count.mockResolvedValue(0);
    prismaMock.favorite.findUnique.mockResolvedValue(null);
    prismaMock.favorite.create.mockResolvedValue({} as any);
    prismaMock.favorite.delete.mockResolvedValue({} as any);
    prismaMock.article.findUnique.mockResolvedValue(null);
  });

  describe('GET', () => {
    const mockFavorites = [
      {
        id: 'fav1',
        userId: 'test-user-id',
        articleId: 'article1',
        createdAt: new Date('2025-01-01'),
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
            { id: 't2', name: 'TypeScript' },
          ],
        },
      },
      {
        id: 'fav2',
        userId: 'test-user-id',
        articleId: 'article2',
        createdAt: new Date('2025-01-02'),
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
            { id: 't3', name: 'Node.js' },
          ],
        },
      },
    ];

    it('認証済みユーザーのお気に入り一覧を返す', async () => {
      prismaMock.favorite.findMany.mockResolvedValue(mockFavorites);
      prismaMock.favorite.count.mockResolvedValue(2);

      const request = new NextRequest('http://localhost/api/favorites');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.favorites).toHaveLength(2);
      expect(data.favorites[0].title).toBe('Test Article 1');
      expect(data.favorites[0].favoriteId).toBe('fav1');
      expect(data.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });

      expect(prismaMock.favorite.findMany).toHaveBeenCalledWith({
        where: { userId: 'test-user-id' },
        include: {
          article: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });

    it('ページネーションパラメータを正しく処理する', async () => {
      prismaMock.favorite.findMany.mockResolvedValue([mockFavorites[1]]);
      prismaMock.favorite.count.mockResolvedValue(50);

      const request = new NextRequest('http://localhost/api/favorites?page=2&limit=10');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 50,
        totalPages: 5,
      });

      expect(prismaMock.favorite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        })
      );
    });

    it('未認証の場合401を返す', async () => {
      setUnauthenticated();

      const request = new NextRequest('http://localhost/api/favorites');
      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
      expect(prismaMock.favorite.findMany).not.toHaveBeenCalled();
    });

    it('空のお気に入りリストを返す', async () => {
      prismaMock.favorite.findMany.mockResolvedValue([]);
      prismaMock.favorite.count.mockResolvedValue(0);

      const request = new NextRequest('http://localhost/api/favorites');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.favorites).toHaveLength(0);
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

    const mockFavorite = {
      id: 'fav1',
      userId: 'test-user-id',
      articleId: 'article1',
      createdAt: new Date('2025-01-01'),
      article: {
        ...mockArticle,
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
          { id: 't1', name: 'JavaScript' },
        ],
      },
    };

    it('記事をお気に入りに追加する', async () => {
      prismaMock.article.findUnique.mockResolvedValue(mockArticle);
      prismaMock.favorite.findUnique.mockResolvedValue(null);
      prismaMock.favorite.create.mockResolvedValue(mockFavorite);

      const request = new NextRequest('http://localhost/api/favorites', {
        method: 'POST',
        body: JSON.stringify({ articleId: 'article1' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.message).toBe('Article favorited successfully');
      expect(data.favorite.title).toBe('Test Article');
      expect(data.favorite.favoriteId).toBe('fav1');

      expect(prismaMock.article.findUnique).toHaveBeenCalledWith({
        where: { id: 'article1' },
      });
      expect(prismaMock.favorite.create).toHaveBeenCalledWith({
        data: {
          userId: 'test-user-id',
          articleId: 'article1',
        },
        include: {
          article: {
            select: {
              id: true,
              title: true,
              url: true,
              summary: true,
              thumbnail: true,
              publishedAt: true,
            },
          },
        },
      });
    });

    it('articleIdが無い場合400を返す', async () => {
      const request = new NextRequest('http://localhost/api/favorites', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Article ID is required');
      expect(prismaMock.favorite.create).not.toHaveBeenCalled();
    });

    it('記事が存在しない場合404を返す', async () => {
      prismaMock.article.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/favorites', {
        method: 'POST',
        body: JSON.stringify({ articleId: 'nonexistent' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Article not found');
      expect(prismaMock.favorite.create).not.toHaveBeenCalled();
    });

    it('既にお気に入りに追加されている場合409を返す', async () => {
      prismaMock.article.findUnique.mockResolvedValue(mockArticle);
      prismaMock.favorite.findUnique.mockResolvedValue({ id: 'existing-fav' });

      const request = new NextRequest('http://localhost/api/favorites', {
        method: 'POST',
        body: JSON.stringify({ articleId: 'article1' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toBe('Already favorited');
      expect(prismaMock.favorite.create).not.toHaveBeenCalled();
    });

    it('未認証の場合401を返す', async () => {
      setUnauthenticated();

      const request = new NextRequest('http://localhost/api/favorites', {
        method: 'POST',
        body: JSON.stringify({ articleId: 'article1' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
      expect(prismaMock.favorite.create).not.toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    const mockFavorite = {
      id: 'fav1',
      userId: 'test-user-id',
      articleId: 'article1',
      createdAt: new Date('2025-01-01'),
    };

    it('お気に入りから記事を削除する', async () => {
      prismaMock.favorite.findUnique.mockResolvedValue(mockFavorite);
      prismaMock.favorite.delete.mockResolvedValue(mockFavorite);

      const request = new NextRequest('http://localhost/api/favorites?articleId=article1');
      const response = await DELETE(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('Article removed from favorites');

      expect(prismaMock.favorite.findUnique).toHaveBeenCalledWith({
        where: {
          userId_articleId: {
            userId: 'test-user-id',
            articleId: 'article1',
          },
        },
      });
      expect(prismaMock.favorite.delete).toHaveBeenCalledWith({
        where: { id: 'fav1' },
      });
    });

    it('articleIdが無い場合400を返す', async () => {
      const request = new NextRequest('http://localhost/api/favorites');
      const response = await DELETE(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Article ID is required');
      expect(prismaMock.favorite.delete).not.toHaveBeenCalled();
    });

    it('お気に入りが見つからない場合404を返す', async () => {
      prismaMock.favorite.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/favorites?articleId=nonexistent');
      const response = await DELETE(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Favorite not found');
      expect(prismaMock.favorite.delete).not.toHaveBeenCalled();
    });

    it('未認証の場合401を返す', async () => {
      setUnauthenticated();

      const request = new NextRequest('http://localhost/api/favorites?articleId=article1');
      const response = await DELETE(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
      expect(prismaMock.favorite.delete).not.toHaveBeenCalled();
    });
  });
});