import { NextRequest } from 'next/server';
import { GET as articlesGET } from '@/app/api/articles/route';
import { GET as favoritesGET } from '@/app/api/favorites/route';
import { GET as articleViewsGET } from '@/app/api/article-views/route';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/database';

// Mock dependencies
jest.mock('@/lib/database');
jest.mock('@/lib/auth/auth');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockAuth = auth as jest.MockedFunction<typeof auth>;

describe('DB Optimization - Parallel Queries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Articles API', () => {
    it('should execute count and findMany in parallel', async () => {
      // Setup
      const mockArticles = [
        { id: '1', title: 'Test Article 1', url: 'http://test1.com' },
        { id: '2', title: 'Test Article 2', url: 'http://test2.com' },
      ];

      // Use Promise.all spy to verify parallel execution
      const promiseAllSpy = jest.spyOn(Promise, 'all');

      mockPrisma.article.count = jest.fn().mockResolvedValue(10);
      mockPrisma.article.findMany = jest.fn().mockResolvedValue(mockArticles);

      const request = new NextRequest('http://localhost:3000/api/articles');

      // Execute
      const response = await articlesGET(request);
      const data = await response.json();

      // Verify
      expect(promiseAllSpy).toHaveBeenCalled();
      expect(mockPrisma.article.count).toHaveBeenCalled();
      expect(mockPrisma.article.findMany).toHaveBeenCalled();
      expect(data.success).toBe(true);
      expect(data.data.total).toBe(10);
      expect(data.data.items).toHaveLength(2);

      promiseAllSpy.mockRestore();
    });
  });

  describe('Favorites API', () => {
    it('should execute count and findMany in parallel', async () => {
      // Setup
      mockAuth.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com' },
      } as any);

      const mockFavorites = [
        {
          id: 'fav-1',
          userId: 'user-1',
          articleId: 'article-1',
          article: { id: 'article-1', title: 'Test Article' }
        },
      ];

      const promiseAllSpy = jest.spyOn(Promise, 'all');

      mockPrisma.favorite.count = jest.fn().mockResolvedValue(5);
      mockPrisma.favorite.findMany = jest.fn().mockResolvedValue(mockFavorites);

      const request = new NextRequest('http://localhost:3000/api/favorites');

      // Execute
      const response = await favoritesGET(request);
      const data = await response.json();

      // Verify
      expect(promiseAllSpy).toHaveBeenCalled();
      expect(mockPrisma.favorite.count).toHaveBeenCalled();
      expect(mockPrisma.favorite.findMany).toHaveBeenCalled();
      expect(data.total).toBe(5);
      expect(data.favorites).toHaveLength(1);

      promiseAllSpy.mockRestore();
    });
  });

  describe('Article Views API', () => {
    it('should execute count and findMany in parallel', async () => {
      // Setup
      mockAuth.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com' },
      } as any);

      const mockViews = [
        {
          id: 'view-1',
          userId: 'user-1',
          articleId: 'article-1',
          viewedAt: new Date(),
          article: { id: 'article-1', title: 'Test Article' }
        },
      ];

      const promiseAllSpy = jest.spyOn(Promise, 'all');

      mockPrisma.articleView.count = jest.fn().mockResolvedValue(8);
      mockPrisma.articleView.findMany = jest.fn().mockResolvedValue(mockViews);

      const request = new NextRequest('http://localhost:3000/api/article-views');

      // Execute
      const response = await articleViewsGET(request);
      const data = await response.json();

      // Verify
      expect(promiseAllSpy).toHaveBeenCalled();
      expect(mockPrisma.articleView.count).toHaveBeenCalled();
      expect(mockPrisma.articleView.findMany).toHaveBeenCalled();
      expect(data.total).toBe(8);
      expect(data.views).toHaveLength(1);

      promiseAllSpy.mockRestore();
    });
  });
});

describe('Cache TTL Optimization', () => {
  it('should use optimized TTL values', async () => {
    const { LayeredCache } = require('@/lib/cache/layered-cache');
    const cache = new LayeredCache();

    // Access private properties through any type casting for testing
    const cacheInstance = cache as any;

    // Verify TTL values are optimized
    expect(cacheInstance.l1Cache.config.ttl).toBe(7200); // 2 hours
    expect(cacheInstance.l2Cache.config.ttl).toBe(1800); // 30 minutes
    expect(cacheInstance.l3Cache.config.ttl).toBe(900);  // 15 minutes
  });

  it('should use optimized TTL for SourceCache', () => {
    const { SourceCache } = require('@/lib/cache/source-cache');
    const sourceCache = new SourceCache();

    // Access private properties through any type casting for testing
    const cacheInstance = sourceCache as any;

    // Verify TTL value is optimized (5 minutes = 300000ms)
    expect(cacheInstance.nameCacheTtlMs).toBe(300000);
  });
});