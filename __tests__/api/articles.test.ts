import { GET, POST } from '@/app/api/articles/route';
import {
  testApiHandler,
  createMockPrismaClient,
  createMockRedisClient,
  generateSampleArticle,
  expectApiSuccess,
  expectApiError,
} from './test-utils';

// Prismaクライアントのモック
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: createMockPrismaClient(),
}));

// Redisクライアントのモック
const mockRedis = createMockRedisClient();
jest.mock('@/lib/redis', () => ({
  __esModule: true,
  default: mockRedis,
  getRedisClient: () => mockRedis,
}));

describe('Articles API', () => {
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = require('@/lib/prisma').default;
  });

  describe('GET /api/articles', () => {
    it('記事一覧を正常に取得できる', async () => {
      const sampleArticles = [
        generateSampleArticle({ id: '1', title: 'Article 1' }),
        generateSampleArticle({ id: '2', title: 'Article 2' }),
      ];

      mockPrisma.article.findMany.mockResolvedValue(sampleArticles);
      mockPrisma.article.count.mockResolvedValue(2);

      const response = await testApiHandler(GET, {
        url: 'http://localhost:3000/api/articles',
      });

      expectApiSuccess(response);
      expect(response.body).toHaveProperty('articles');
      expect(response.body.articles).toHaveLength(2);
      expect(response.body).toHaveProperty('total', 2);
    });

    it('ページネーションパラメータが機能する', async () => {
      mockPrisma.article.findMany.mockResolvedValue([
        generateSampleArticle({ id: '3', title: 'Article 3' }),
      ]);
      mockPrisma.article.count.mockResolvedValue(10);

      const response = await testApiHandler(GET, {
        url: 'http://localhost:3000/api/articles',
        searchParams: {
          page: '2',
          limit: '5',
        },
      });

      expectApiSuccess(response);
      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
        })
      );
    });

    it('ソースフィルターが機能する', async () => {
      mockPrisma.article.findMany.mockResolvedValue([]);
      mockPrisma.article.count.mockResolvedValue(0);

      const response = await testApiHandler(GET, {
        url: 'http://localhost:3000/api/articles',
        searchParams: {
          source: 'dev.to',
        },
      });

      expectApiSuccess(response);
      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceId: 'dev.to',
          }),
        })
      );
    });

    it('検索クエリが機能する', async () => {
      mockPrisma.article.findMany.mockResolvedValue([]);
      mockPrisma.article.count.mockResolvedValue(0);

      const response = await testApiHandler(GET, {
        url: 'http://localhost:3000/api/articles',
        searchParams: {
          q: 'JavaScript',
        },
      });

      expectApiSuccess(response);
      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
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
      
      mockRedis.get.mockResolvedValue(cachedData);

      const response = await testApiHandler(GET, {
        url: 'http://localhost:3000/api/articles',
      });

      expectApiSuccess(response);
      expect(mockRedis.get).toHaveBeenCalled();
      expect(mockPrisma.article.findMany).not.toHaveBeenCalled();
    });

    it('エラーハンドリングが適切に動作する', async () => {
      mockPrisma.article.findMany.mockRejectedValue(new Error('Database error'));

      const response = await testApiHandler(GET, {
        url: 'http://localhost:3000/api/articles',
      });

      expectApiError(response, 500);
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
      mockPrisma.article.create.mockResolvedValue(createdArticle);

      const response = await testApiHandler(POST, {
        method: 'POST',
        url: 'http://localhost:3000/api/articles',
        body: newArticle,
      });

      expectApiSuccess(response);
      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe(newArticle.title);
    });

    it('必須フィールドが欠けている場合エラーを返す', async () => {
      const invalidArticle = {
        title: 'Missing URL',
        // url is missing
        content: 'Content',
      };

      const response = await testApiHandler(POST, {
        method: 'POST',
        url: 'http://localhost:3000/api/articles',
        body: invalidArticle,
      });

      expectApiError(response, 400);
    });

    it('重複URLの記事作成を防ぐ', async () => {
      const duplicateArticle = {
        title: 'Duplicate Article',
        url: 'https://example.com/duplicate',
        content: 'Content',
        sourceId: 'test-source',
      };

      mockPrisma.article.findFirst.mockResolvedValue(
        generateSampleArticle({ url: duplicateArticle.url })
      );

      const response = await testApiHandler(POST, {
        method: 'POST',
        url: 'http://localhost:3000/api/articles',
        body: duplicateArticle,
      });

      expectApiError(response, 409);
    });

    it('タグ付きの記事を作成できる', async () => {
      const articleWithTags = {
        title: 'Article with Tags',
        url: 'https://example.com/tags',
        content: 'Content',
        sourceId: 'test-source',
        tags: ['JavaScript', 'React'],
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrisma);
      });

      mockPrisma.article.create.mockResolvedValue(
        generateSampleArticle(articleWithTags)
      );

      const response = await testApiHandler(POST, {
        method: 'POST',
        url: 'http://localhost:3000/api/articles',
        body: articleWithTags,
      });

      expectApiSuccess(response);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('キャッシュをクリアする', async () => {
      const newArticle = {
        title: 'Cache Clear Test',
        url: 'https://example.com/cache',
        content: 'Content',
        sourceId: 'test-source',
      };

      mockPrisma.article.create.mockResolvedValue(
        generateSampleArticle(newArticle)
      );

      const response = await testApiHandler(POST, {
        method: 'POST',
        url: 'http://localhost:3000/api/articles',
        body: newArticle,
      });

      expectApiSuccess(response);
      expect(mockRedis.del).toHaveBeenCalled();
    });
  });
});