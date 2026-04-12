/**
 * /api/favorites/[articleId] エンドポイントのテスト
 *
 * P2002 (unique constraint violation) ハンドリングの回帰テスト
 */

// モックの設定（jest.mock は import より前に）
jest.mock('@/lib/prisma');
jest.mock('@/lib/auth/get-session');
jest.mock('@/lib/favorites/cache-helpers', () => ({
  updateFavoriteCacheBestEffort: jest.fn().mockResolvedValue(undefined),
  setFavoriteBustCookie: jest.fn(),
}));
// レート制限をモック（テスト中は常に許可）
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: (_policy: string, handler: Function) => handler,
}));
// CSRF保護をモック（テスト中はバイパス）
jest.mock('@/lib/middleware/csrf-protection', () => ({
  withCSRFProtection: (handler: Function) => handler,
}));
// withUserValidationをモック（validatedUserをcontextに注入）
jest.mock('@/lib/middleware/with-user-validation', () => ({
  withUserValidation: (handler: Function) => handler,
}));
jest.mock('@/lib/utils/prisma-error-handler', () => ({
  handlePrismaError: jest.fn().mockReturnValue(null),
}));

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/get-session';
import { prisma } from '@/lib/prisma';

const prismaMock = prisma as any;
const authMock = getSession as jest.MockedFunction<typeof getSession>;

const TEST_USER = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
};

const resetMockSession = () =>
  authMock.mockResolvedValue({
    user: TEST_USER,
    session: { id: 's1', userId: TEST_USER.id, token: 'tok', expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });

describe('/api/favorites/[articleId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockSession();

    prismaMock.favorite = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({} as any),
      delete: jest.fn().mockResolvedValue({} as any),
    };
    prismaMock.article = {
      findUnique: jest.fn().mockResolvedValue(null),
    };
  });

  describe('GET', () => {
    it('未認証の場合 isFavorited: false を返す', async () => {
      authMock.mockResolvedValue(null);

      const { GET } = await import(
        '@/app/api/favorites/[articleId]/route'
      );

      const request = new Request(
        'http://localhost/api/favorites/article1'
      );
      const response = await GET(request, {
        params: Promise.resolve({ articleId: 'article1' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.isFavorited).toBe(false);
    });

    it('認証済みでお気に入り済みの場合 isFavorited: true を返す', async () => {
      prismaMock.favorite.findUnique.mockResolvedValue({
        id: 'fav-1',
        userId: TEST_USER.id,
        articleId: 'article1',
      });

      const { GET } = await import(
        '@/app/api/favorites/[articleId]/route'
      );

      const request = new Request(
        'http://localhost/api/favorites/article1'
      );
      const response = await GET(request, {
        params: Promise.resolve({ articleId: 'article1' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.isFavorited).toBe(true);
      expect(data.favoriteId).toBe('fav-1');
    });
  });

  describe('POST', () => {
    const mockArticle = {
      id: 'article1',
      title: 'Test Article',
    };

    const createPostRequest = () =>
      new NextRequest('http://localhost/api/favorites/article1', {
        method: 'POST',
        headers: { Origin: 'http://localhost' },
      });

    const createContext = () => ({
      params: Promise.resolve({ articleId: 'article1' }),
      validatedUser: TEST_USER,
    });

    it('記事をお気に入りに追加する', async () => {
      prismaMock.article.findUnique.mockResolvedValue(mockArticle);
      prismaMock.favorite.create.mockResolvedValue({
        id: 'fav-1',
        userId: TEST_USER.id,
        articleId: 'article1',
        createdAt: new Date('2025-01-01'),
        article: mockArticle,
      });

      const { POST } = await import(
        '@/app/api/favorites/[articleId]/route'
      );

      const response = await POST(createPostRequest(), createContext());

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('Article favorited successfully');
      expect(data.isFavorited).toBe(true);
      expect(data.favoriteId).toBe('fav-1');
    });

    it('記事が存在しない場合404を返す', async () => {
      prismaMock.article.findUnique.mockResolvedValue(null);

      const { POST } = await import(
        '@/app/api/favorites/[articleId]/route'
      );

      const response = await POST(createPostRequest(), createContext());

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Article not found');
    });

    it('既にお気に入りの場合P2002で409を返す', async () => {
      prismaMock.article.findUnique.mockResolvedValue(mockArticle);
      const { Prisma } = jest.requireActual('@prisma/client');
      prismaMock.favorite.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed',
          {
            code: 'P2002',
            clientVersion: '0.0.0',
          }
        )
      );

      const { POST } = await import(
        '@/app/api/favorites/[articleId]/route'
      );

      const response = await POST(createPostRequest(), createContext());

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toBe('Already favorited');
    });
  });

  describe('DELETE', () => {
    const createDeleteRequest = () =>
      new NextRequest('http://localhost/api/favorites/article1', {
        method: 'DELETE',
        headers: { Origin: 'http://localhost' },
      });

    const createContext = () => ({
      params: Promise.resolve({ articleId: 'article1' }),
      validatedUser: TEST_USER,
    });

    it('お気に入りから記事を削除する', async () => {
      prismaMock.favorite.findUnique.mockResolvedValue({
        id: 'fav-1',
        userId: TEST_USER.id,
        articleId: 'article1',
      });
      prismaMock.favorite.delete.mockResolvedValue({});

      const { DELETE } = await import(
        '@/app/api/favorites/[articleId]/route'
      );

      const response = await DELETE(
        createDeleteRequest(),
        createContext()
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('Article removed from favorites');
      expect(data.isFavorited).toBe(false);
    });

    it('お気に入りが見つからない場合404を返す', async () => {
      prismaMock.favorite.findUnique.mockResolvedValue(null);

      const { DELETE } = await import(
        '@/app/api/favorites/[articleId]/route'
      );

      const response = await DELETE(
        createDeleteRequest(),
        createContext()
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Favorite not found');
    });
  });
});
