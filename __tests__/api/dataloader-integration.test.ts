// Prismaモックを最初に定義
jest.mock('@/lib/prisma');

import { NextRequest } from 'next/server';
import { GET as articlesListGET } from '@/app/api/articles/list/route';
import { GET as articlesGET } from '@/app/api/articles/route';
import { prisma } from '@/lib/prisma';
// DataLoaderは動的にインポート

// Mock auth
jest.mock('@/lib/auth/auth', () => ({
  auth: jest.fn()
}));

// Mock Redis cache to isolate DataLoader behavior
jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    generateCacheKey: jest.fn().mockReturnValue('test-key'),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    delete: jest.fn().mockResolvedValue(true),
  }))
}));

// Mock Redis cache directly
jest.mock('@/lib/cache/redis-cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    delete: jest.fn().mockResolvedValue(true),
  }))
}));

// Mock memory cache
jest.mock('@/lib/cache/memory-cache', () => ({
  DataLoaderMemoryCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    clear: jest.fn(),
  }))
}));

jest.mock('@/lib/cache/layered-cache', () => ({
  LayeredCache: jest.fn().mockImplementation(() => ({
    getArticles: jest.fn().mockResolvedValue(null),
    setArticles: jest.fn().mockResolvedValue(true),
  }))
}));

jest.mock('@/lib/cache/cache-invalidator', () => ({
  CacheInvalidator: jest.fn().mockImplementation(() => ({}))
}));

jest.mock('@/lib/cache/source-cache', () => ({
  sourceCache: {
    getAllSources: jest.fn().mockResolvedValue([])
  }
}));

// Logger is now globally mocked in __mocks__/lib/logger.ts

// Prismaのモック型を定義
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('DataLoader Integration Tests', () => {
  const userId = 'test-user-123';
  const mockAuth = require('@/lib/auth/auth').auth as jest.Mock;
  let createLoaders: any;
  let resetFavoriteLoaderCaches: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules(); // モジュールキャッシュをクリア

    // モジュールを再インポート（モックが適用された状態で）
    createLoaders = require('@/lib/dataloader').createLoaders;
    resetFavoriteLoaderCaches = require('@/lib/dataloader/favorite-loader').resetFavoriteLoaderCaches;

    resetFavoriteLoaderCaches(); // キャッシュをリセット

    // Setup auth mock
    mockAuth.mockResolvedValue({
      user: { id: userId }
    });
  });

  describe('DataLoader batching behavior', () => {
    it('should batch multiple favorite requests in /api/articles/list', async () => {
      // Create test articles
      const articleIds = ['article-1', 'article-2', 'article-3'];

      // Create DataLoader instance
      const loaders = createLoaders({ userId });

      // Mock Prisma favorite.findMany
      const findManySpy = jest.spyOn(mockPrisma.favorite, 'findMany');
      findManySpy.mockResolvedValue([
        { id: '1', userId, articleId: articleIds[0], createdAt: new Date() },
        { id: '2', userId, articleId: articleIds[2], createdAt: new Date() }
      ]);

      // Simulate multiple load requests (these should be batched)
      const favoritePromises = articleIds.map(id =>
        loaders.favorite?.load(id)
      );

      const results = await Promise.all(favoritePromises);

      // Verify batching: only 1 database query should be made
      expect(findManySpy).toHaveBeenCalledTimes(1);
      expect(findManySpy).toHaveBeenCalledWith({
        where: {
          userId,
          articleId: {
            in: articleIds
          }
        }
      });

      // Verify results
      expect(results[0]).toEqual({
        articleId: articleIds[0],
        isFavorited: true,
        favoritedAt: expect.any(Date)
      });
      expect(results[1]).toEqual({
        articleId: articleIds[1],
        isFavorited: false,
        favoritedAt: undefined
      });
      expect(results[2]).toEqual({
        articleId: articleIds[2],
        isFavorited: true,
        favoritedAt: expect.any(Date)
      });

      findManySpy.mockRestore();
    });

    it('should batch view status requests', async () => {
      const articleIds = ['article-1', 'article-2', 'article-3'];

      const loaders = createLoaders({ userId });

      // Spy on Prisma articleView.findMany
      const findManySpy = jest.spyOn(mockPrisma.articleView, 'findMany');
      findManySpy.mockResolvedValue([
        {
          id: '1',
          userId,
          articleId: articleIds[0],
          isRead: true,
          viewedAt: new Date(),
          readAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      // Simulate multiple load requests
      const viewPromises = articleIds.map(id =>
        loaders.view?.load(id)
      );

      const results = await Promise.all(viewPromises);

      // Verify batching
      expect(findManySpy).toHaveBeenCalledTimes(1);
      expect(findManySpy).toHaveBeenCalledWith({
        where: {
          userId,
          articleId: {
            in: articleIds
          }
        }
      });

      // Verify results
      expect(results[0]).toEqual({
        articleId: articleIds[0],
        isViewed: true,
        isRead: true,
        viewedAt: expect.any(Date),
        readAt: expect.any(Date)
      });
      expect(results[1]).toEqual({
        articleId: articleIds[1],
        isViewed: false,
        isRead: false,
        viewedAt: undefined,
        readAt: undefined
      });

      findManySpy.mockRestore();
    });
  });

  describe('API endpoint integration', () => {
    it('should use DataLoader in /api/articles/list endpoint', async () => {
      // Spy on Prisma methods
      const articleFindManySpy = jest.spyOn(mockPrisma.article, 'findMany');
      articleFindManySpy.mockResolvedValue([
        {
          id: 'article-1',
          title: 'Test Article 1',
          url: 'http://test.com/1',
          summary: 'Summary 1',
          thumbnail: null,
          publishedAt: new Date(),
          sourceId: 'source-1',
          category: null,
          qualityScore: 80,
          bookmarks: 10,
          userVotes: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
          content: null,
          detailedSummary: null,
          authors: [],
          readingTime: null,
          language: null,
          metaDescription: null,
          summaryVersion: 7,
          articleType: 'unified'
        }
      ]);

      const articleCountSpy = jest.spyOn(mockPrisma.article, 'count');
      articleCountSpy.mockResolvedValue(1);

      const sourceFindManySpy = jest.spyOn(mockPrisma.source, 'findMany');
      sourceFindManySpy.mockResolvedValue([
        {
          id: 'source-1',
          name: 'Test Source',
          type: 'RSS',
          url: 'http://source.com',
          rssUrl: null,
          siteUrl: null,
          siteIcon: null,
          active: true,
          isExtended: false,
          fetchInterval: 60,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      const favoriteFindManySpy = jest.spyOn(mockPrisma.favorite, 'findMany');
      favoriteFindManySpy.mockResolvedValue([]);

      const viewFindManySpy = jest.spyOn(mockPrisma.articleView, 'findMany');
      viewFindManySpy.mockResolvedValue([]);

      // Create request
      const request = new NextRequest(
        'http://localhost:3000/api/articles/list?includeUserData=true',
        {
          method: 'GET'
        }
      );

      // Call the API endpoint
      const response = await articlesListGET(request);
      const data = await response.json();

      // Verify response
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(1);

      // Verify DataLoader was used (only 1 query for favorites and views)
      expect(favoriteFindManySpy).toHaveBeenCalledTimes(1);
      expect(viewFindManySpy).toHaveBeenCalledTimes(1);

      // Clean up
      articleFindManySpy.mockRestore();
      articleCountSpy.mockRestore();
      sourceFindManySpy.mockRestore();
      favoriteFindManySpy.mockRestore();
      viewFindManySpy.mockRestore();
    });
  });

  describe('DataLoader caching behavior', () => {
    it('should cache results within the same request', async () => {
      const loaders = createLoaders({ userId });

      const findManySpy = jest.spyOn(mockPrisma.favorite, 'findMany');
      findManySpy.mockResolvedValue([
        { id: '1', userId, articleId: 'article-1', createdAt: new Date() }
      ]);

      // Load the same article ID multiple times
      const result1 = await loaders.favorite?.load('article-1');
      const result2 = await loaders.favorite?.load('article-1');
      const result3 = await loaders.favorite?.load('article-1');

      // Should only query database once due to caching
      expect(findManySpy).toHaveBeenCalledTimes(1);

      // All results should be the same instance
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);

      findManySpy.mockRestore();
    });

    it('should have separate cache per request (no cross-request pollution)', async () => {
      // Create two separate loader instances (simulating different requests)
      const loaders1 = createLoaders({ userId: 'user-1' });
      const loaders2 = createLoaders({ userId: 'user-2' });

      const findManySpy = jest.spyOn(mockPrisma.favorite, 'findMany');
      findManySpy.mockImplementation(async ({ where }) => {
        const userId = where?.userId as string;
        return userId === 'user-1'
          ? [{ id: '1', userId: 'user-1', articleId: 'article-1', createdAt: new Date() }]
          : [];
      });

      // Load from both loaders
      const result1 = await loaders1.favorite?.load('article-1');
      const result2 = await loaders2.favorite?.load('article-1');

      // Should query database twice (once per loader instance)
      expect(findManySpy).toHaveBeenCalledTimes(2);

      // Results should be different
      expect(result1?.isFavorited).toBe(true);
      expect(result2?.isFavorited).toBe(false);

      findManySpy.mockRestore();
    });
  });
});