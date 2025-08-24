/**
 * APIテスト - Articles
 * Manual Mocksを使用したAPIルートハンドラーのテスト
 */

import { GET, POST } from '@/app/api/articles/route';
import {
  createMockRequest,
  createMockContext,
  parseResponse,
  setupPrismaMock,
  setupRedisMock,
  expectApiSuccess,
  expectApiError,
  expectCacheHit,
  _expectCacheSet,
  expectDatabaseQuery,
} from '../helpers/mock-helpers';
import { generateSampleArticle } from './test-utils';

// Manual mocksのインポート
import prismaMock from '@/__mocks__/lib/prisma';
import redisMock from '@/__mocks__/lib/redis/client';

// モックの自動適用
jest.mock('@/lib/database');
// Redisクライアントのモックはjest.setup.node.jsで設定済み

describe('Articles API Tests', () => {
  beforeEach(() => {
    // モックのセットアップ
    setupPrismaMock();
    setupRedisMock();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/articles', () => {
    it('記事一覧を正常に取得できる', async () => {
      const sampleArticles = [
        generateSampleArticle({ id: '1', title: 'Article 1' }),
        generateSampleArticle({ id: '2', title: 'Article 2' }),
      ];

      prismaMock.article.findMany.mockResolvedValue(sampleArticles);
      prismaMock.article.count.mockResolvedValue(2);

      const request = createMockRequest('http://localhost:3000/api/articles');
      const context = createMockContext();
      
      const response = await GET(request, context);
      const result = await parseResponse(response);
      
      expectApiSuccess(result);
      expect(result.body.articles).toHaveLength(2);
      expect(result.body.total).toBe(2);
      expectDatabaseQuery(prismaMock, 'article', 'findMany');
    });

    it('ページネーションパラメータが機能する', async () => {
      const sampleArticle = generateSampleArticle({ id: '3', title: 'Article 3' });
      
      prismaMock.article.findMany.mockResolvedValue([sampleArticle]);
      prismaMock.article.count.mockResolvedValue(10);

      const request = createMockRequest('http://localhost:3000/api/articles', {
        searchParams: { page: '2', limit: '5' },
      });
      const context = createMockContext();
      
      const response = await GET(request, context);
      const result = await parseResponse(response);
      
      expectApiSuccess(result);
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
        })
      );
    });

    it('ソースフィルターが機能する', async () => {
      prismaMock.article.findMany.mockResolvedValue([]);
      prismaMock.article.count.mockResolvedValue(0);

      const request = createMockRequest('http://localhost:3000/api/articles', {
        searchParams: { source: 'dev.to' },
      });
      const context = createMockContext();
      
      const response = await GET(request, context);
      const result = await parseResponse(response);
      
      expectApiSuccess(result);
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceId: 'dev.to',
          }),
        })
      );
    });

    it('検索クエリが機能する', async () => {
      prismaMock.article.findMany.mockResolvedValue([]);
      prismaMock.article.count.mockResolvedValue(0);

      const request = createMockRequest('http://localhost:3000/api/articles', {
        searchParams: { q: 'JavaScript' },
      });
      const context = createMockContext();
      
      const response = await GET(request, context);
      const result = await parseResponse(response);
      
      expectApiSuccess(result);
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                title: expect.objectContaining({
                  contains: 'JavaScript',
                }),
              }),
            ]),
          }),
        })
      );
    });

    it('キャッシュが機能する', async () => {
      const cachedData = JSON.stringify({
        articles: [generateSampleArticle()],
        total: 1,
      });
      
      redisMock.get.mockResolvedValue(cachedData);

      const request = createMockRequest('http://localhost:3000/api/articles');
      const context = createMockContext();
      
      const response = await GET(request, context);
      const result = await parseResponse(response);
      
      expectApiSuccess(result);
      expectCacheHit(redisMock, expect.stringContaining('articles:'));
      expect(prismaMock.article.findMany).not.toHaveBeenCalled();
    });

    it('エラーハンドリングが適切に動作する', async () => {
      prismaMock.article.findMany.mockRejectedValue(new Error('Database error'));

      const request = createMockRequest('http://localhost:3000/api/articles');
      const context = createMockContext();
      
      const response = await GET(request, context);
      const result = await parseResponse(response);
      
      expectApiError(result, 500);
    });
  });

  describe('POST /api/articles', () => {
    it('新しい記事を作成できる', async () => {
      const newArticle = {
        title: 'New Article',
        url: 'https://example.com/new',
        content: 'New content',
        sourceId: 'test-source',
      };

      const createdArticle = generateSampleArticle(newArticle);
      prismaMock.article.create.mockResolvedValue(createdArticle);

      const request = createMockRequest('http://localhost:3000/api/articles', {
        method: 'POST',
        body: newArticle,
      });
      const context = createMockContext();
      
      const response = await POST(request, context);
      const result = await parseResponse(response);
      
      expectApiSuccess(result, 201);
      expect(result.body.id).toBeDefined();
      expect(result.body.title).toBe(newArticle.title);
    });

    it('必須フィールドが欠けている場合エラーを返す', async () => {
      const invalidArticle = {
        title: 'Missing URL',
        // url is missing
        content: 'Content',
      };

      const request = createMockRequest('http://localhost:3000/api/articles', {
        method: 'POST',
        body: invalidArticle,
      });
      const context = createMockContext();
      
      const response = await POST(request, context);
      const result = await parseResponse(response);
      
      expectApiError(result, 400);
    });

    it('重複URLの記事作成を防ぐ', async () => {
      const duplicateArticle = {
        title: 'Duplicate Article',
        url: 'https://example.com/duplicate',
        content: 'Content',
        sourceId: 'test-source',
      };

      prismaMock.article.findFirst.mockResolvedValue(
        generateSampleArticle({ url: duplicateArticle.url })
      );

      const request = createMockRequest('http://localhost:3000/api/articles', {
        method: 'POST',
        body: duplicateArticle,
      });
      const context = createMockContext();
      
      const response = await POST(request, context);
      const result = await parseResponse(response);
      
      expectApiError(result, 409);
    });

    it('タグ付きの記事を作成できる', async () => {
      const articleWithTags = {
        title: 'Article with Tags',
        url: 'https://example.com/tags',
        content: 'Content',
        sourceId: 'test-source',
        tags: ['JavaScript', 'React'],
      };

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return callback(prismaMock);
      });

      prismaMock.article.create.mockResolvedValue(
        generateSampleArticle(articleWithTags)
      );

      const request = createMockRequest('http://localhost:3000/api/articles', {
        method: 'POST',
        body: articleWithTags,
      });
      const context = createMockContext();
      
      const response = await POST(request, context);
      const result = await parseResponse(response);
      
      expectApiSuccess(result, 201);
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('キャッシュをクリアする', async () => {
      const newArticle = {
        title: 'Cache Clear Test',
        url: 'https://example.com/cache',
        content: 'Content',
        sourceId: 'test-source',
      };

      prismaMock.article.create.mockResolvedValue(
        generateSampleArticle(newArticle)
      );

      const request = createMockRequest('http://localhost:3000/api/articles', {
        method: 'POST',
        body: newArticle,
      });
      const context = createMockContext();
      
      const response = await POST(request, context);
      const result = await parseResponse(response);
      
      expectApiSuccess(result, 201);
      expect(redisMock.del).toHaveBeenCalled();
    });
  });
});