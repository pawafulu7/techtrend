// Mock dependencies
jest.mock('@/lib/auth/auth');
jest.mock('@/lib/cache/favorites-cache');

import { NextRequest } from 'next/server';
import { GET as articlesGET } from '@/app/api/articles/route';
import { GET as favoritesGET } from '@/app/api/favorites/route';
import { GET as articleViewsGET } from '@/app/api/article-views/route';
import { auth } from '@/lib/auth/auth';
const { prisma, resetPrismaMock } = require('@/lib/database');

const mockAuth = auth as jest.MockedFunction<typeof auth>;

describe('DB Optimization - Parallel Queries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPrismaMock();
  });

  describe('Articles API', () => {
    it('should execute count and findMany in parallel', async () => {
      const mockArticles = [
        { id: '1', title: 'Test Article 1', url: 'http://test1.com' },
        { id: '2', title: 'Test Article 2', url: 'http://test2.com' },
      ];

      const promiseAllSpy = jest.spyOn(Promise, 'all');

      prisma.article.count.mockResolvedValue(10 as any);
      prisma.article.findMany.mockResolvedValue(mockArticles as any);

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await articlesGET(request);
      const data = await response.json();

      expect(promiseAllSpy).toHaveBeenCalled();
      expect(prisma.article.count).toHaveBeenCalled();
      expect(prisma.article.findMany).toHaveBeenCalled();
      expect(data.success).toBe(true);
      expect(data.data.total).toBe(10);
      expect(data.data.items).toHaveLength(2);

      promiseAllSpy.mockRestore();
    });
  });

  describe('Favorites API', () => {
    it('should execute count and findMany in parallel', async () => {
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

      prisma.favorite.count.mockResolvedValue(5 as any);
      prisma.favorite.findMany.mockResolvedValue(mockFavorites as any);

      const request = new NextRequest('http://localhost:3000/api/favorites');
      const response = await favoritesGET(request);
      const data = await response.json();

      expect(promiseAllSpy).toHaveBeenCalled();
      expect(prisma.favorite.count).toHaveBeenCalled();
      expect(prisma.favorite.findMany).toHaveBeenCalled();
      expect(data.pagination.total).toBe(5);
      expect(data.favorites).toHaveLength(1);

      promiseAllSpy.mockRestore();
    });
  });

  describe('Article Views API', () => {
    it('should execute count and findMany in parallel', async () => {
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

      prisma.articleView.count.mockResolvedValue(8 as any);
      prisma.articleView.findMany.mockResolvedValue(mockViews as any);

      const request = new NextRequest('http://localhost:3000/api/article-views');
      const response = await articleViewsGET(request);
      const data = await response.json();

      expect(promiseAllSpy).toHaveBeenCalled();
      expect(prisma.articleView.count).toHaveBeenCalled();
      expect(prisma.articleView.findMany).toHaveBeenCalled();
      expect(data.pagination.total).toBe(8);
      expect(data.views).toHaveLength(1);

      promiseAllSpy.mockRestore();
    });
  });
});
