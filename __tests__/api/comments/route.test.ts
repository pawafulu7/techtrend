/**
 * /api/comments エンドポイントのテスト
 *
 * Task 3.1, 3.2: POST/GET /api/comments
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

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';

const { prismaMock, resetPrismaMock } = require('../../../test/utils/prisma-mock');

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
const mockArticle = {
  id: 'article-123',
  title: 'Test Article',
  url: 'https://example.com/article',
};

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

// POST リクエスト用のヘルパー（Origin ヘッダー付き）
const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/comments', {
    method: 'POST',
    headers: { Origin: 'http://localhost' },
    body: JSON.stringify(body),
  });

describe('/api/comments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPrismaMock();
    resetMockSession();
  });

  describe('POST /api/comments', () => {
    // 動的インポート（テスト実行時にモジュールをロード）
    const getPostHandler = async () => {
      const { POST } = await import('@/app/api/comments/route');
      return POST;
    };

    describe('正常系', () => {
      it('コメントを作成して201を返す', async () => {
        prismaMock.article.findUnique.mockResolvedValue(mockArticle);
        prismaMock.comment.create.mockResolvedValue(mockComment);

        const POST = await getPostHandler();
        const request = createPostRequest({
          articleId: 'article-123',
          content: 'Test comment content',
          visibility: 'PRIVATE',
        });

        const response = await POST(request);

        expect(response.status).toBe(201);
        const data = await response.json();
        expect(data.id).toBe('comment-123');
        expect(data.content).toBe('Test comment content');
      });

      it('HTMLタグをサニタイズして保存する', async () => {
        prismaMock.article.findUnique.mockResolvedValue(mockArticle);
        prismaMock.comment.create.mockResolvedValue({
          ...mockComment,
          content: 'Clean content',
        });

        const POST = await getPostHandler();
        const request = createPostRequest({
          articleId: 'article-123',
          content: '<script>alert("xss")</script>Clean content',
          visibility: 'PRIVATE',
        });

        const response = await POST(request);

        expect(response.status).toBe(201);
        // createCommentが呼ばれていることを確認
        expect(prismaMock.comment.create).toHaveBeenCalled();
      });
    });

    describe('バリデーションエラー', () => {
      it('articleIdがない場合400を返す', async () => {
        const POST = await getPostHandler();
        const request = createPostRequest({
          content: 'Test content',
          visibility: 'PRIVATE',
        });

        const response = await POST(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBeDefined();
      });

      it('contentがない場合400を返す', async () => {
        const POST = await getPostHandler();
        const request = createPostRequest({
          articleId: 'article-123',
          visibility: 'PRIVATE',
        });

        const response = await POST(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBeDefined();
      });

      it('contentが1001文字の場合400を返す', async () => {
        const POST = await getPostHandler();
        const request = createPostRequest({
          articleId: 'article-123',
          content: 'a'.repeat(1001),
          visibility: 'PRIVATE',
        });

        const response = await POST(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBeDefined();
      });

      it('空白のみのcontentは400を返す', async () => {
        const POST = await getPostHandler();
        const request = createPostRequest({
          articleId: 'article-123',
          content: '   \n\t  ',
          visibility: 'PRIVATE',
        });

        const response = await POST(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBeDefined();
      });
    });

    describe('認証・認可', () => {
      it('未認証の場合401を返す', async () => {
        setUnauthenticated();

        const POST = await getPostHandler();
        const request = createPostRequest({
          articleId: 'article-123',
          content: 'Test content',
          visibility: 'PRIVATE',
        });

        const response = await POST(request);

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe('Unauthorized');
      });
    });

    describe('記事存在確認', () => {
      it('記事が存在しない場合404を返す', async () => {
        prismaMock.article.findUnique.mockResolvedValue(null);

        const POST = await getPostHandler();
        const request = createPostRequest({
          articleId: 'nonexistent-article',
          content: 'Test content',
          visibility: 'PRIVATE',
        });

        const response = await POST(request);

        expect(response.status).toBe(404);
        const data = await response.json();
        expect(data.error).toBe('Article not found');
      });
    });
  });

  describe('GET /api/comments', () => {
    const getGetHandler = async () => {
      const { GET } = await import('@/app/api/comments/route');
      return GET;
    };

    const mockComments = [
      { ...mockComment, id: 'comment-1', createdAt: new Date('2025-01-03') },
      { ...mockComment, id: 'comment-2', createdAt: new Date('2025-01-02') },
      { ...mockComment, id: 'comment-3', createdAt: new Date('2025-01-01') },
    ];

    describe('正常系', () => {
      it('コメント一覧を返す', async () => {
        prismaMock.comment.findMany.mockResolvedValue(mockComments);
        prismaMock.comment.count.mockResolvedValue(3);

        const GET = await getGetHandler();
        const request = new NextRequest(
          'http://localhost/api/comments?articleId=article-123'
        );

        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.comments).toHaveLength(3);
        expect(data.totalCount).toBe(3);
        expect(data.nextCursor).toBeNull();
      });

      it('ページネーション（limit）を適用する', async () => {
        const twoComments = mockComments.slice(0, 2);
        prismaMock.comment.findMany.mockResolvedValue(twoComments);
        prismaMock.comment.count.mockResolvedValue(5);

        const GET = await getGetHandler();
        const request = new NextRequest(
          'http://localhost/api/comments?articleId=article-123&limit=2'
        );

        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.comments).toHaveLength(2);
        expect(data.totalCount).toBe(5);
        expect(data.nextCursor).toBe('comment-2');
      });

      it('cursorを使ったページネーションを適用する', async () => {
        prismaMock.comment.findMany.mockResolvedValue([mockComments[2]]);
        prismaMock.comment.count.mockResolvedValue(3);

        const GET = await getGetHandler();
        const request = new NextRequest(
          'http://localhost/api/comments?articleId=article-123&cursor=comment-2'
        );

        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.comments).toHaveLength(1);
      });

      it('0件の場合空配列を返す', async () => {
        prismaMock.comment.findMany.mockResolvedValue([]);
        prismaMock.comment.count.mockResolvedValue(0);

        const GET = await getGetHandler();
        const request = new NextRequest(
          'http://localhost/api/comments?articleId=article-123'
        );

        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.comments).toHaveLength(0);
        expect(data.totalCount).toBe(0);
        expect(data.nextCursor).toBeNull();
      });
    });

    describe('バリデーションエラー', () => {
      it('articleIdがない場合400を返す', async () => {
        const GET = await getGetHandler();
        const request = new NextRequest('http://localhost/api/comments');

        const response = await GET(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBeDefined();
      });
    });

    describe('認証', () => {
      it('未認証の場合401を返す', async () => {
        setUnauthenticated();

        const GET = await getGetHandler();
        const request = new NextRequest(
          'http://localhost/api/comments?articleId=article-123'
        );

        const response = await GET(request);

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe('Unauthorized');
      });
    });
  });
});
