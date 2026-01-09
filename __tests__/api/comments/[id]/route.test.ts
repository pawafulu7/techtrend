/**
 * /api/comments/[id] エンドポイントのテスト
 *
 * Task 3.3: PUT/DELETE /api/comments/[id]
 */

// モックの設定（jest.mock は import より前に）
jest.mock('@/lib/auth/auth');
jest.mock('@/lib/cache/comments-cache', () => ({
  commentsCache: {
    getComments: jest.fn().mockResolvedValue(null),
    setComments: jest.fn().mockResolvedValue(undefined),
    invalidate: jest.fn().mockResolvedValue(undefined),
  },
}));
// レート制限をモック（テスト中は常に許可）
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: (_policy: string, handler: Function) => handler,
}));
// CSRF保護をモック（テスト中はバイパス）
jest.mock('@/lib/middleware/csrf-protection', () => ({
  withCSRFProtection: (handler: Function) => handler,
}));

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';

const { prismaMock, resetPrismaMock } = require('../../../../test/utils/prisma-mock');

// モック関数のヘルパー
const authMock = auth as jest.MockedFunction<typeof auth>;
const setUnauthenticated = () => authMock.mockResolvedValue(null);
const resetMockSession = () =>
  authMock.mockResolvedValue({
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

// テストフィクスチャ
const mockComment = {
  id: 'comment-123',
  articleId: 'article-123',
  userId: 'test-user-id',
  content: 'Test comment content',
  visibility: 'PRIVATE',
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
  deletedAt: null,
};

const mockOtherUserComment = {
  ...mockComment,
  id: 'comment-other',
  userId: 'other-user-id',
};

// リクエスト作成ヘルパー（Origin ヘッダー付き）
const createPutRequest = (id: string, body: object) =>
  new NextRequest(`http://localhost/api/comments/${id}`, {
    method: 'PUT',
    headers: { Origin: 'http://localhost' },
    body: JSON.stringify(body),
  });

const createDeleteRequest = (id: string) =>
  new NextRequest(`http://localhost/api/comments/${id}`, {
    method: 'DELETE',
    headers: { Origin: 'http://localhost' },
  });

// Common context helper for route handlers
// Used by both PUT and DELETE test sections
const createContext = (
  id: string,
  options: { userId?: string; includeSession?: boolean } = {}
) => {
  const { userId = 'test-user-id', includeSession = true } = options;
  const base = {
    params: Promise.resolve({ id }),
  };
  if (!includeSession) return base;
  return {
    ...base,
    session: {
      user: { id: userId, email: 'test@example.com', name: 'Test User' },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    validatedUser: { id: userId, deletedAt: null },
  };
};

describe('/api/comments/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPrismaMock();
    resetMockSession();
  });

  describe('PUT /api/comments/[id]', () => {
    const getPutHandler = async () => {
      const { PUT } = await import('@/app/api/comments/[id]/route');
      return PUT;
    };

    describe('正常系', () => {
      it('コメントを更新して200を返す', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockComment);
        prismaMock.comment.update.mockResolvedValue({
          ...mockComment,
          content: 'Updated content',
          updatedAt: new Date(),
        });

        const PUT = await getPutHandler();
        const request = createPutRequest('comment-123', {
          content: 'Updated content',
        });

        const response = await PUT(request, createContext('comment-123'));

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.content).toBe('Updated content');
      });

      it('visibility を更新できる', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockComment);
        prismaMock.comment.update.mockResolvedValue({
          ...mockComment,
          visibility: 'PUBLIC',
          updatedAt: new Date(),
        });

        const PUT = await getPutHandler();
        const request = createPutRequest('comment-123', {
          visibility: 'PUBLIC',
        });

        const response = await PUT(request, createContext('comment-123'));

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.visibility).toBe('PUBLIC');
      });
    });

    describe('バリデーションエラー', () => {
      it('空のcontentは400を返す', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockComment);

        const PUT = await getPutHandler();
        const request = createPutRequest('comment-123', {
          content: '',
        });

        const response = await PUT(request, createContext('comment-123'));

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBeDefined();
      });

      it('1001文字以上のcontentは400を返す', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockComment);

        const PUT = await getPutHandler();
        const request = createPutRequest('comment-123', {
          content: 'a'.repeat(1001),
        });

        const response = await PUT(request, createContext('comment-123'));

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBeDefined();
      });
    });

    describe('認証・認可', () => {
      it('未認証の場合401を返す', async () => {
        setUnauthenticated();

        const PUT = await getPutHandler();
        const request = createPutRequest('comment-123', {
          content: 'Updated content',
        });

        // SessionContext optimization: use includeSession=false to test unauthenticated path
        const response = await PUT(
          request,
          createContext('comment-123', { includeSession: false })
        );

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe('Unauthorized');
      });

      it('他ユーザーのコメントは403を返す', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockOtherUserComment);

        const PUT = await getPutHandler();
        const request = createPutRequest('comment-other', {
          content: 'Updated content',
        });

        const response = await PUT(request, createContext('comment-other'));

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe('Permission denied');
      });
    });

    describe('存在確認', () => {
      it('コメントが存在しない場合404を返す', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(null);

        const PUT = await getPutHandler();
        const request = createPutRequest('nonexistent', {
          content: 'Updated content',
        });

        const response = await PUT(request, createContext('nonexistent'));

        expect(response.status).toBe(404);
        const data = await response.json();
        expect(data.error).toBe('Comment not found');
      });

      it('削除済みコメントは404を返す', async () => {
        prismaMock.comment.findUnique.mockResolvedValue({
          ...mockComment,
          deletedAt: new Date(),
        });

        const PUT = await getPutHandler();
        const request = createPutRequest('comment-123', {
          content: 'Updated content',
        });

        const response = await PUT(request, createContext('comment-123'));

        expect(response.status).toBe(404);
        const data = await response.json();
        expect(data.error).toBe('Comment not found');
      });
    });
  });

  describe('DELETE /api/comments/[id]', () => {
    const getDeleteHandler = async () => {
      const { DELETE } = await import('@/app/api/comments/[id]/route');
      return DELETE;
    };

    describe('正常系', () => {
      it('コメントを削除して204を返す', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockComment);
        prismaMock.comment.update.mockResolvedValue({
          ...mockComment,
          deletedAt: new Date(),
        });

        const DELETE = await getDeleteHandler();
        const request = createDeleteRequest('comment-123');

        const response = await DELETE(request, createContext('comment-123'));

        expect(response.status).toBe(204);
        expect(prismaMock.comment.update).toHaveBeenCalledWith({
          where: { id: 'comment-123' },
          data: { deletedAt: expect.any(Date) },
        });
      });
    });

    describe('認証・認可', () => {
      it('未認証の場合401を返す', async () => {
        setUnauthenticated();

        const DELETE = await getDeleteHandler();
        const request = createDeleteRequest('comment-123');

        // SessionContext optimization: use includeSession=false to test unauthenticated path
        const response = await DELETE(
          request,
          createContext('comment-123', { includeSession: false })
        );

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe('Unauthorized');
      });

      it('他ユーザーのコメントは403を返す', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(mockOtherUserComment);

        const DELETE = await getDeleteHandler();
        const request = createDeleteRequest('comment-other');

        const response = await DELETE(request, createContext('comment-other'));

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe('Permission denied');
      });
    });

    describe('存在確認', () => {
      it('コメントが存在しない場合404を返す', async () => {
        prismaMock.comment.findUnique.mockResolvedValue(null);

        const DELETE = await getDeleteHandler();
        const request = createDeleteRequest('nonexistent');

        const response = await DELETE(request, createContext('nonexistent'));

        expect(response.status).toBe(404);
        const data = await response.json();
        expect(data.error).toBe('Comment not found');
      });

      it('削除済みコメントは404を返す', async () => {
        prismaMock.comment.findUnique.mockResolvedValue({
          ...mockComment,
          deletedAt: new Date(),
        });

        const DELETE = await getDeleteHandler();
        const request = createDeleteRequest('comment-123');

        const response = await DELETE(request, createContext('comment-123'));

        expect(response.status).toBe(404);
        const data = await response.json();
        expect(data.error).toBe('Comment not found');
      });
    });
  });
});
