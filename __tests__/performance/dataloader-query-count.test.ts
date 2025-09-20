import { prisma } from '@/lib/prisma';
import { createLoaders } from '@/lib/dataloader';
import { batchGetFavorites, batchGetViews, batchGetUserStates } from '@/lib/batch/batch-utils';

/**
 * DataLoader Performance Test
 *
 * Tests query reduction from N+1 to 1 using DataLoader pattern
 * Uses jest-mock-extended's prismaMock from jest.setup.node.js
 */
describe('DataLoader Query Count Performance', () => {
  const userId = 'test-user-123';
  const articleIds = Array.from({ length: 50 }, (_, i) => `article-${i}`);

  beforeEach(() => {
    // Clear all mock history before each test
    jest.clearAllMocks();

    // Setup mock responses
    (prisma.favorite.findMany as jest.Mock).mockResolvedValue([
      { id: '1', userId, articleId: articleIds[0], createdAt: new Date() },
      { id: '2', userId, articleId: articleIds[10], createdAt: new Date() },
    ]);

    (prisma.articleView.findMany as jest.Mock).mockResolvedValue([
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
    (prisma.favorite.findUnique as jest.Mock).mockResolvedValue(null);
  });

  describe('N+1 Query Problem vs DataLoader Solution', () => {
    it('WITHOUT DataLoader: should execute N queries (N+1 problem)', async () => {
      // Simulate the N+1 problem - fetch favorites one by one
      const results = [];
      for (const articleId of articleIds) {
        const favorite = await prisma.favorite.findUnique({
          where: {
            userId_articleId: { userId, articleId }
          }
        });
        results.push(favorite !== null);
      }

      // Assert N queries were made
      expect(prisma.favorite.findUnique as jest.Mock).toHaveBeenCalledTimes(50);
      expect(results).toHaveLength(50);

      console.log(`N+1 Problem: ${(prisma.favorite.findUnique as jest.Mock).mock.calls.length} queries for ${articleIds.length} articles`);
    });

    it('WITH DataLoader: should execute only 1 batched query', async () => {
      const loaders = createLoaders({ userId });

      // Load all articles using DataLoader
      const results = await Promise.all(
        articleIds.map(id => loaders.favorite?.load(id))
      );

      // Assert only 1 batched query was made
      expect(prisma.favorite.findMany as jest.Mock).toHaveBeenCalledTimes(1);

      // Verify the batched query used IN clause
      const call = (prisma.favorite.findMany as jest.Mock).mock.calls[0][0];
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
      const loaders = createLoaders({ userId });
      const articleId = articleIds[0];

      // Load same article multiple times
      const result1 = await loaders.favorite?.load(articleId);
      const result2 = await loaders.favorite?.load(articleId);
      const result3 = await loaders.favorite?.load(articleId);

      // Should only make 1 query due to caching
      expect(prisma.favorite.findMany as jest.Mock).toHaveBeenCalledTimes(1);

      // All results should be the same instance (cached)
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);

      console.log(`Cache Test: 1 query for 3 loads of same article (cache working)`);
    });

    it('DataLoader should batch multiple different articles', async () => {
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
      expect(prisma.favorite.findMany as jest.Mock).toHaveBeenCalledTimes(1);

      // Verify batch contained all requested IDs
      const call = (prisma.favorite.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.articleId.in).toEqual(expect.arrayContaining(testArticles));

      console.log(`Batch Test: 1 query for ${testArticles.length} different articles`);
    });
  });

  describe('Batch Utils Performance', () => {
    it('batchGetFavorites should make 1 query for multiple articles', async () => {
      const results = await batchGetFavorites(userId, articleIds);

      // Should make exactly 1 query
      expect(prisma.favorite.findMany as jest.Mock).toHaveBeenCalledTimes(1);

      // Verify query structure
      const call = (prisma.favorite.findMany as jest.Mock).mock.calls[0][0];
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
      expect(prisma.articleView.findMany as jest.Mock).toHaveBeenCalledTimes(1);

      // Verify query structure
      const call = (prisma.articleView.findMany as jest.Mock).mock.calls[0][0];
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
      expect(prisma.favorite.findMany as jest.Mock).toHaveBeenCalledTimes(1);
      expect(prisma.articleView.findMany as jest.Mock).toHaveBeenCalledTimes(1);

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
      // Reset mocks for clean comparison
      jest.clearAllMocks();

      // Setup counters
      let naiveQueryCount = 0;
      let optimizedQueryCount = 0;

      // 1. Measure naive approach
      (prisma.favorite.findUnique as jest.Mock).mockImplementation(async () => {
        naiveQueryCount++;
        return null;
      });

      for (const articleId of articleIds.slice(0, 10)) {
        await prisma.favorite.findUnique({
          where: { userId_articleId: { userId, articleId } }
        });
      }

      // 2. Measure optimized approach
      jest.clearAllMocks();
      (prisma.favorite.findMany as jest.Mock).mockImplementation(async () => {
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