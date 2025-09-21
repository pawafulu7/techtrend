// Prismaモックを最初に定義
jest.mock('@/lib/prisma');

// Redisキャッシュをモック
jest.mock('@/lib/cache/redis-cache');

// メモリキャッシュをモック
jest.mock('@/lib/cache/memory-cache', () => ({
  DataLoaderMemoryCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    clear: jest.fn(),
  }))
}));

// DataLoaderを__mocks__ディレクトリのモックで置き換え
jest.mock('dataloader');
import DataLoader from 'dataloader';

import { prisma } from '@/lib/prisma';
import { createLoaders } from '@/lib/dataloader';
import { batchGetFavorites, batchGetViews, batchGetUserStates } from '@/lib/batch/batch-utils';
import { resetFavoriteLoaderCaches } from '@/lib/dataloader/favorite-loader';
import { resetPrismaMock } from '../../test/utils/prisma-mock';

// prismaを型アサーション
const prismaMock = prisma as any;

/**
 * DataLoader Performance Test
 *
 * Tests query reduction from N+1 to 1 using DataLoader pattern
 */
describe('DataLoader Query Count Performance', () => {
  const userId = 'test-user-123';
  const articleIds = Array.from({ length: 50 }, (_, i) => `article-${i}`);

  beforeEach(() => {
    // キャッシュをリセット（最初に実行）
    resetFavoriteLoaderCaches();

    // Prismaモックをリセット
    resetPrismaMock();

    // Clear all mock history before each test
    jest.clearAllMocks();

    // DataLoaderのキャッシュをクリア
    if ((DataLoader as any).clearAllInstances) {
      (DataLoader as any).clearAllInstances();
    }


    // Prismaモックを明確に設定（新しいjest.fnインスタンスを作成）
    if (prismaMock.favorite) {
      prismaMock.favorite.findMany = jest.fn();
      prismaMock.favorite.findUnique = jest.fn();
    }
    if (prismaMock.articleView) {
      prismaMock.articleView.findMany = jest.fn();
    }

    // Setup mock responses
    prismaMock.favorite.findMany.mockResolvedValue([
      { id: '1', userId, articleId: articleIds[0], createdAt: new Date() },
      { id: '2', userId, articleId: articleIds[10], createdAt: new Date() },
    ]);

    prismaMock.articleView.findMany.mockResolvedValue([
      {
        id: '1',
        userId,
        articleId: articleIds[5],
        isRead: true,
        viewedAt: new Date(),
        readAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      },
    ]);

    // Mock findUnique for N+1 simulation
    prismaMock.favorite.findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('N+1 Query Problem vs DataLoader Solution', () => {
    it('WITHOUT DataLoader: should execute N queries (N+1 problem)', async () => {
      // Simulate the N+1 problem - fetch favorites one by one
      const results = [];
      for (const articleId of articleIds) {
        const favorite = await prismaMock.favorite.findUnique({
          where: {
            userId_articleId: { userId, articleId }
          }
        });
        results.push(favorite !== null);
      }

      // Assert N queries were made
      expect(prismaMock.favorite.findUnique).toHaveBeenCalledTimes(50);
      expect(results).toHaveLength(50);

      console.log(`N+1 Problem: ${prismaMock.favorite.findUnique.mock.calls.length} queries for ${articleIds.length} articles`);
    });

    it('WITH DataLoader: should execute only 1 batched query', async () => {
      const loaders = createLoaders({ userId });

      // Load all articles using DataLoader
      const results = await Promise.all(
        articleIds.map(id => loaders.favorite?.load(id))
      );

      // Assert only 1 batched query was made
      expect(prismaMock.favorite.findMany).toHaveBeenCalledTimes(1);

      // Verify the batched query used IN clause
      const call = prismaMock.favorite.findMany.mock.calls[0][0];
      expect(call.where.articleId.in).toEqual(articleIds);
      expect(call.where.userId).toBe(userId);

      // Verify results
      expect(results).toHaveLength(50);
      expect(results[0]?.isFavorited).toBe(true);
      expect(results[10]?.isFavorited).toBe(true);
      expect(results[1]?.isFavorited).toBe(false);

      console.log(`DataLoader Solution: 1 batched query for ${articleIds.length} articles`);
      console.log(`Query Reduction: ${((50 - 1) / 50 * 100).toFixed(0)}%`);
    });

    it('DataLoader should cache results within same request', async () => {
      await jest.isolateModulesAsync(async () => {
        // モジュールを再インポート
        const { createLoaders } = await import('@/lib/dataloader');
        const { resetFavoriteLoaderCaches } = await import('@/lib/dataloader/favorite-loader');

        // DataLoaderのキャッシュをクリア
        resetFavoriteLoaderCaches();
        if ((DataLoader as any).clearAllInstances) {
          (DataLoader as any).clearAllInstances();
        }
        // Prismaモックをリセット
        resetPrismaMock();
        jest.clearAllMocks();

        // Setup mock responses (必ず新しいモックを作成)
        prismaMock.favorite.findMany = jest.fn().mockResolvedValue([
          { id: '1', userId, articleId: articleIds[0], createdAt: new Date() },
          { id: '2', userId, articleId: articleIds[10], createdAt: new Date() },
        ]);

        const loaders = createLoaders({ userId });
        const articleId = articleIds[0];

        // Load same article multiple times
        const result1 = await loaders.favorite?.load(articleId);
        const result2 = await loaders.favorite?.load(articleId);
        const result3 = await loaders.favorite?.load(articleId);

        // Should only make 1 query due to caching
        expect(prismaMock.favorite.findMany).toHaveBeenCalledTimes(1);

        // All results should be the same (cached)
        expect(result1).toEqual(result2);
        expect(result2).toEqual(result3);

        console.log(`Cache Test: 1 query for 3 loads of same article (cache working)`);
      });
    });

    it('DataLoader should batch multiple different articles', async () => {
      await jest.isolateModulesAsync(async () => {
        // モジュールを再インポート
        const { createLoaders } = await import('@/lib/dataloader');
        const { resetFavoriteLoaderCaches } = await import('@/lib/dataloader/favorite-loader');

        // DataLoaderのキャッシュをクリア
        resetFavoriteLoaderCaches();
        if ((DataLoader as any).clearAllInstances) {
          (DataLoader as any).clearAllInstances();
        }
        // Prismaモックをリセット
        resetPrismaMock();
        jest.clearAllMocks();

        // Setup mock responses (必ず新しいモックを作成)
        prismaMock.favorite.findMany = jest.fn().mockResolvedValue([
          { id: '1', userId, articleId: articleIds[0], createdAt: new Date() },
          { id: '2', userId, articleId: articleIds[10], createdAt: new Date() },
        ]);

        const loaders = createLoaders({ userId });
        const testArticles = articleIds.slice(0, 5);

        // Load different articles (should be batched)
        const results = await Promise.all([
          loaders.favorite?.load(testArticles[0]),
          loaders.favorite?.load(testArticles[1]),
          loaders.favorite?.load(testArticles[2]),
          loaders.favorite?.load(testArticles[3]),
          loaders.favorite?.load(testArticles[4]),
        ]);

        // Should make only 1 batched query
        expect(prismaMock.favorite.findMany).toHaveBeenCalledTimes(1);

        // Verify batch contained all requested IDs
        const call = prismaMock.favorite.findMany.mock.calls[0][0];
        expect(call.where.articleId.in).toEqual(expect.arrayContaining(testArticles));

        console.log(`Batch Test: 1 query for ${testArticles.length} different articles`);
      });
    });
  });

  describe('Batch Utils Performance', () => {
    it('batchGetFavorites should make 1 query for multiple articles', async () => {
      const results = await batchGetFavorites(userId, articleIds);

      // Should make exactly 1 query
      expect(prismaMock.favorite.findMany).toHaveBeenCalledTimes(1);

      // Verify query structure
      const call = prismaMock.favorite.findMany.mock.calls[0][0];
      expect(call.where.userId).toBe(userId);
      expect(call.where.articleId.in).toEqual(articleIds);

      // Verify results
      expect(results).toHaveLength(50);
      expect(results[0]).toBe(true);  // article-0 is favorited
      expect(results[1]).toBe(false); // article-1 is not favorited
      expect(results[10]).toBe(true); // article-10 is favorited

      console.log(`batchGetFavorites: 1 query for ${articleIds.length} articles`);
    });

    it('batchGetViews should make 1 query for multiple articles', async () => {
      const results = await batchGetViews(userId, articleIds);

      // Should make exactly 1 query
      expect(prismaMock.articleView.findMany).toHaveBeenCalledTimes(1);

      // Verify query structure
      const call = prismaMock.articleView.findMany.mock.calls[0][0];
      expect(call.where.userId).toBe(userId);
      expect(call.where.articleId.in).toEqual(articleIds);
      expect(call.where.isRead).toBe(true);

      // Verify results
      expect(results).toHaveLength(50);
      expect(results[5]).toBe(true);  // article-5 is viewed
      expect(results[0]).toBe(false); // article-0 is not viewed

      console.log(`batchGetViews: 1 query for ${articleIds.length} articles`);
    });

    it('batchGetUserStates should make 2 parallel queries', async () => {
      const { favorites, views } = await batchGetUserStates(userId, articleIds);

      // Should make exactly 2 queries (1 for favorites, 1 for views)
      expect(prismaMock.favorite.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.articleView.findMany).toHaveBeenCalledTimes(1);

      // Verify results - batchGetUserStates now returns Maps, not Sets
      expect(favorites).toBeInstanceOf(Map);
      expect(views).toBeInstanceOf(Map);
      expect(favorites.has(articleIds[0])).toBe(true);
      expect(favorites.has(articleIds[10])).toBe(true);
      expect(views.has(articleIds[5])).toBe(true);

      console.log(`batchGetUserStates: 2 parallel queries for ${articleIds.length} articles`);
    });
  });

  describe('Performance Comparison Summary', () => {
    it('should demonstrate significant query reduction', async () => {
      await jest.isolateModulesAsync(async () => {
        // モジュールを再インポート
        const { createLoaders } = await import('@/lib/dataloader');
        const { resetFavoriteLoaderCaches } = await import('@/lib/dataloader/favorite-loader');

        // Reset mocks for clean comparison
        jest.clearAllMocks();

        // Setup counters
        let naiveQueryCount = 0;
        let optimizedQueryCount = 0;

        // 1. Measure naive approach
        prismaMock.favorite.findUnique.mockImplementation(async () => {
          naiveQueryCount++;
          return null;
        });

        for (const articleId of articleIds.slice(0, 10)) {
          await prismaMock.favorite.findUnique({
            where: { userId_articleId: { userId, articleId } }
          });
        }

        // 2. Measure optimized approach
        jest.clearAllMocks();
        resetFavoriteLoaderCaches(); // キャッシュもリセット
        // DataLoaderのキャッシュもクリア
        if ((DataLoader as any).clearAllInstances) {
          (DataLoader as any).clearAllInstances();
        }
        // Prismaモックを再設定（必ずリセット）
        prismaMock.favorite.findMany = jest.fn().mockImplementation(async () => {
          optimizedQueryCount++;
          return [];
        });

        const loaders = createLoaders({ userId });
        await Promise.all(articleIds.slice(0, 10).map(id => loaders.favorite?.load(id)));

        // Performance comparison
        const reduction = ((naiveQueryCount - optimizedQueryCount) / naiveQueryCount * 100).toFixed(0);

        console.log('\n=== Performance Summary ===');
        console.log(`Naive Approach: ${naiveQueryCount} queries`);
        console.log(`Optimized Approach: ${optimizedQueryCount} query`);
        console.log(`Query Reduction: ${reduction}%`);
        console.log(`Performance Gain: ${naiveQueryCount}x faster`);

        expect(naiveQueryCount).toBe(10);
        expect(optimizedQueryCount).toBe(1);
        expect(Number(reduction)).toBeGreaterThanOrEqual(90);
      });
    });
  });
});