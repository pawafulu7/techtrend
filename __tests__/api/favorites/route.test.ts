/**
 * /api/favorites エンドポイントのテスト
 */

// モックの設定
jest.mock('@/lib/prisma');
jest.mock('@/lib/auth/get-session');

import { GET } from '@/app/api/favorites/route';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth/get-session';
import { NextRequest } from 'next/server';

// モック関数のヘルパーを取得
const prismaMock = prisma as any;
const authMock = getSession as jest.MockedFunction<typeof getSession>;

const mockSessionData = {
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
  },
  session: { id: 's1', userId: 'test-user-id', token: 'tok', expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
};

const setUnauthenticated = () => {
  authMock.mockResolvedValue(null);
  const { auth } = require('@/lib/auth/auth');
  (auth.api.getSession as jest.Mock).mockResolvedValue(null);
};
const resetMockSession = () => {
  authMock.mockResolvedValue(mockSessionData);
  const { auth } = require('@/lib/auth/auth');
  (auth.api.getSession as jest.Mock).mockResolvedValue(mockSessionData);
};

describe('/api/favorites', () => {
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

    // モックのリセット - 関数を再作成
    prismaMock.favorite = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({} as any),
      delete: jest.fn().mockResolvedValue({} as any),
    };

    prismaMock.article = {
      findUnique: jest.fn().mockResolvedValue(null),
    };

    // withUserValidation用のユーザー存在確認モック
    prismaMock.user = {
      findUnique: jest.fn().mockResolvedValue({ id: 'test-user-id', deletedAt: null }),
    };
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
          article: {
            select: {
              id: true,
              title: true,
              url: true,
              summary: true,
              publishedAt: true,
              thumbnail: true,
              source: {
                select: {
                  id: true,
                  name: true,
                },
              },
              tags: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
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
});
