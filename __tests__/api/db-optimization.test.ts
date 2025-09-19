// Mock dependencies
jest.mock('@/lib/database');
jest.mock('@/lib/prisma');
jest.mock('@/lib/auth/auth');
jest.mock('@/lib/cache/favorites-cache');

import { NextRequest } from 'next/server';
import { GET as articlesGET } from '@/app/api/articles/route';
import { GET as favoritesGET } from '@/app/api/favorites/route';
import { GET as articleViewsGET } from '@/app/api/article-views/route';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/database';

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

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

      (mockPrisma.article.count as jest.Mock).mockResolvedValue(10);
      (mockPrisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

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

      (mockPrisma.favorite.count as jest.Mock).mockResolvedValue(5);
      (mockPrisma.favorite.findMany as jest.Mock).mockResolvedValue(mockFavorites);

      const request = new NextRequest('http://localhost:3000/api/favorites');

      // Execute
      const response = await favoritesGET(request);
      const data = await response.json();

      // Verify
      expect(promiseAllSpy).toHaveBeenCalled();
      expect(mockPrisma.favorite.count).toHaveBeenCalled();
      expect(mockPrisma.favorite.findMany).toHaveBeenCalled();
      expect(data.pagination.total).toBe(5);
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

      (mockPrisma.articleView.count as jest.Mock).mockResolvedValue(8);
      (mockPrisma.articleView.findMany as jest.Mock).mockResolvedValue(mockViews);

      const request = new NextRequest('http://localhost:3000/api/article-views');

      // Execute
      const response = await articleViewsGET(request);
      const data = await response.json();

      // Verify
      expect(promiseAllSpy).toHaveBeenCalled();
      expect(mockPrisma.articleView.count).toHaveBeenCalled();
      expect(mockPrisma.articleView.findMany).toHaveBeenCalled();
      expect(data.pagination.total).toBe(8);
      expect(data.views).toHaveLength(1);

      promiseAllSpy.mockRestore();
    });
  });
});