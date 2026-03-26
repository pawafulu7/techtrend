/**
 * /api/articles/[id] エンドポイントのテスト
 */

// モックの設定
jest.mock('@/lib/database');
jest.mock('@/lib/cache/cache-invalidator');

// PATCH/DELETE は admin 認証・CSRF・レート制限でラップされているためモックが必要
jest.mock('@/lib/middleware/with-admin-auth', () => ({
  withAdminAuth: jest.fn((handler: any) => {
    return (request: any, context: any) => {
      return handler(request, {
        ...context,
        session: { user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' } },
      });
    };
  }),
}));

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_key: string, handler: any) => handler),
}));

jest.mock('@/lib/middleware/csrf-protection', () => ({
  withCSRFProtection: jest.fn((handler: any) => handler),
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { GET, PATCH, DELETE } from '@/app/api/articles/[id]/route';
import { prisma } from '@/lib/database';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { NextRequest } from 'next/server';

const prismaMock = prisma as any;
const cacheInvalidatorMock = cacheInvalidator as jest.Mocked<typeof cacheInvalidator>;

describe('/api/articles/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // デフォルトのPrismaモック設定
    prismaMock.article = {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      delete: jest.fn(),
    };
    
    // キャッシュ無効化モック設定
    cacheInvalidatorMock.onArticleUpdated = jest.fn().mockResolvedValue(undefined);
    cacheInvalidatorMock.onArticleDeleted = jest.fn().mockResolvedValue(undefined);
  });

  describe('GET', () => {
    const mockArticle = {
      id: 'article1',
      title: 'Test Article',
      url: 'https://example.com/article',
      summary: 'Test summary',
      detailedSummary: 'Detailed test summary',
      content: 'Full article content',
      thumbnail: 'https://example.com/thumb.jpg',
      publishedAt: new Date('2025-01-01'),
      qualityScore: 85,
      sourceId: 'qiita',
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
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
        { id: 't1', name: 'React', createdAt: new Date(), updatedAt: new Date() },
        { id: 't2', name: 'TypeScript', createdAt: new Date(), updatedAt: new Date() },
      ],
    };

    it('記事の詳細を返す', async () => {
      prismaMock.article.findUnique.mockResolvedValue(mockArticle);

      const request = new NextRequest('http://localhost/api/articles/article1');
      const params = Promise.resolve({ id: 'article1' });
      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data.title).toBe('Test Article');
      expect(data.data.tags).toHaveLength(2);

      expect(prismaMock.article.findUnique).toHaveBeenCalledWith({
        where: { id: 'article1' },
        include: {
          source: true,
          tags: true,
        },
      });
    });

    it('記事が存在しない場合404を返す', async () => {
      prismaMock.article.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/articles/nonexistent');
      const params = Promise.resolve({ id: 'nonexistent' });
      const response = await GET(request, { params });

      expect(response.status).toBe(404);
      const data = await response.json();
      
      expect(data.success).toBe(false);
      expect(data.error).toBe('Article not found');
    });

    it('データベースエラーの場合500を返す', async () => {
      prismaMock.article.findUnique.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/articles/article1');
      const params = Promise.resolve({ id: 'article1' });
      const response = await GET(request, { params });

      expect(response.status).toBe(500);
      const data = await response.json();
      
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch article');
      expect(data.details).toBe('Database error');
    });
  });

  // PATCH/DELETE は withAdminAuth + withCSRFProtection + withRateLimit で保護されており、
  // テストでは上記ミドルウェアをモック（認証済みアドミン）して動作確認を行う。
  // CUID形式のIDを使用（実装側で z.string().cuid() バリデーションあり）
  const VALID_ARTICLE_ID = 'clxxxxxxxxxxxxxxxxxxxxxxxxx';

  describe('PATCH', () => {
    const mockArticle = {
      id: VALID_ARTICLE_ID,
      title: 'Updated Article',
      summary: 'Updated summary',
      detailedSummary: 'Updated detailed summary',
      content: 'Updated content',
      thumbnail: 'https://example.com/new-thumb.jpg',
      url: 'https://example.com/article',
      publishedAt: new Date('2025-01-01'),
      qualityScore: 90,
      sourceId: 'qiita',
      isHidden: false,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-02'),
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
        { id: 't3', name: 'Vue.js', createdAt: new Date(), updatedAt: new Date() },
        { id: 't4', name: 'Nuxt.js', createdAt: new Date(), updatedAt: new Date() },
      ],
    };

    it('記事を更新する', async () => {
      prismaMock.article.update.mockResolvedValue(mockArticle);

      const request = new NextRequest(`http://localhost/api/articles/${VALID_ARTICLE_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Updated Article',
          summary: 'Updated summary',
          content: 'Updated content',
          thumbnail: 'https://example.com/new-thumb.jpg',
        }),
      });
      const params = Promise.resolve({ id: VALID_ARTICLE_ID });
      const response = await PATCH(request, { params });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.title).toBe('Updated Article');

      expect(prismaMock.article.update).toHaveBeenCalledWith({
        where: { id: VALID_ARTICLE_ID },
        data: {
          title: 'Updated Article',
          summary: 'Updated summary',
          content: 'Updated content',
          thumbnail: 'https://example.com/new-thumb.jpg',
        },
        include: {
          source: true,
          tags: true,
        },
      });

      expect(cacheInvalidatorMock.onArticleUpdated).toHaveBeenCalledWith(VALID_ARTICLE_ID);
    });

    it('タグを更新する', async () => {
      prismaMock.article.update.mockResolvedValue(mockArticle);

      const request = new NextRequest(`http://localhost/api/articles/${VALID_ARTICLE_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({
          tagNames: ['Vue.js', 'Nuxt.js'],
        }),
      });
      const params = Promise.resolve({ id: VALID_ARTICLE_ID });
      const response = await PATCH(request, { params });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.tags).toHaveLength(2);

      expect(prismaMock.article.update).toHaveBeenCalledWith({
        where: { id: VALID_ARTICLE_ID },
        data: {
          tags: {
            set: [],
            connectOrCreate: [
              { where: { name: 'Vue.js' }, create: { name: 'Vue.js' } },
              { where: { name: 'Nuxt.js' }, create: { name: 'Nuxt.js' } },
            ],
          },
        },
        include: {
          source: true,
          tags: true,
        },
      });
    });

    it('部分更新が可能', async () => {
      prismaMock.article.update.mockResolvedValue(mockArticle);

      const request = new NextRequest(`http://localhost/api/articles/${VALID_ARTICLE_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Only Title Updated',
        }),
      });
      const params = Promise.resolve({ id: VALID_ARTICLE_ID });
      const response = await PATCH(request, { params });

      expect(response.status).toBe(200);

      expect(prismaMock.article.update).toHaveBeenCalledWith({
        where: { id: VALID_ARTICLE_ID },
        data: {
          title: 'Only Title Updated',
        },
        include: {
          source: true,
          tags: true,
        },
      });
    });

    it('更新エラーの場合500を返す', async () => {
      prismaMock.article.update.mockRejectedValue(new Error('Update failed'));

      const request = new NextRequest(`http://localhost/api/articles/${VALID_ARTICLE_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Updated Article',
        }),
      });
      const params = Promise.resolve({ id: VALID_ARTICLE_ID });
      const response = await PATCH(request, { params });

      expect(response.status).toBe(500);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to update article');
      expect(data.details).toBe('Update failed');
    });
  });

  describe('DELETE', () => {
    it('記事を削除する', async () => {
      prismaMock.article.delete.mockResolvedValue({ id: VALID_ARTICLE_ID });

      const request = new NextRequest(`http://localhost/api/articles/${VALID_ARTICLE_ID}`);
      const params = Promise.resolve({ id: VALID_ARTICLE_ID });
      const response = await DELETE(request, { params });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.message).toBe('Article deleted successfully');

      expect(prismaMock.article.delete).toHaveBeenCalledWith({
        where: { id: VALID_ARTICLE_ID },
      });

      expect(cacheInvalidatorMock.onArticleDeleted).toHaveBeenCalledWith(VALID_ARTICLE_ID);
    });

    it('削除エラーの場合500を返す', async () => {
      prismaMock.article.delete.mockRejectedValue(new Error('Delete failed'));

      const request = new NextRequest(`http://localhost/api/articles/${VALID_ARTICLE_ID}`);
      const params = Promise.resolve({ id: VALID_ARTICLE_ID });
      const response = await DELETE(request, { params });

      expect(response.status).toBe(500);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to delete article');
      expect(data.details).toBe('Delete failed');
    });

    it('存在しない記事の削除を試みた場合もエラーを返す', async () => {
      prismaMock.article.delete.mockRejectedValue(
        new Error('Record to delete does not exist.')
      );

      const request = new NextRequest(`http://localhost/api/articles/${VALID_ARTICLE_ID}`);
      const params = Promise.resolve({ id: VALID_ARTICLE_ID });
      const response = await DELETE(request, { params });

      expect(response.status).toBe(500);
      const data = await response.json();
      
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to delete article');
      expect(data.details).toBe('Record to delete does not exist.');
    });
  });
});