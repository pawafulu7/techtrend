/**
 * Comprehensive tests for /api/articles endpoint
 * Improves test coverage and validates error handling
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/articles/route';
import { PrismaClient } from '@prisma/client';
import { handleApiError } from '@/lib/api/error-handler';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    article: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock('@/lib/api/error-handler');

const mockPrisma = {
  article: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
} as unknown as PrismaClient;

describe('/api/articles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET', () => {
    it('should return paginated articles with default parameters', async () => {
      const mockArticles = [
        {
          id: '1',
          title: 'Test Article 1',
          url: 'https://example.com/1',
          summary: 'Summary 1',
          publishedAt: new Date('2024-01-01'),
          source: { id: 's1', name: 'Source 1' },
          tags: [{ id: 't1', name: 'tag1' }],
        },
        {
          id: '2',
          title: 'Test Article 2',
          url: 'https://example.com/2',
          summary: 'Summary 2',
          publishedAt: new Date('2024-01-02'),
          source: { id: 's2', name: 'Source 2' },
          tags: [{ id: 't2', name: 'tag2' }],
        },
      ];

      mockPrisma.article.findMany.mockResolvedValue(mockArticles);
      mockPrisma.article.count.mockResolvedValue(100);

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('items');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('page');
      expect(data).toHaveProperty('totalPages');
      expect(data).toHaveProperty('hasMore');
      expect(data.items).toHaveLength(2);
      expect(data.total).toBe(100);
    });

    it('should handle pagination parameters correctly', async () => {
      mockPrisma.article.findMany.mockResolvedValue([]);
      mockPrisma.article.count.mockResolvedValue(50);

      const request = new NextRequest(
        'http://localhost:3000/api/articles?page=2&limit=10'
      );
      await GET(request);

      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (page 2 - 1) * limit 10
          take: 10,
        })
      );
    });

    it('should filter by source IDs', async () => {
      mockPrisma.article.findMany.mockResolvedValue([]);
      mockPrisma.article.count.mockResolvedValue(0);

      const request = new NextRequest(
        'http://localhost:3000/api/articles?sources=source1,source2'
      );
      await GET(request);

      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceId: { in: ['source1', 'source2'] },
          }),
        })
      );
    });

    it('should filter by tag names', async () => {
      mockPrisma.article.findMany.mockResolvedValue([]);
      mockPrisma.article.count.mockResolvedValue(0);

      const request = new NextRequest(
        'http://localhost:3000/api/articles?tags=react,typescript'
      );
      await GET(request);

      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tags: {
              some: {
                name: { in: ['react', 'typescript'] },
              },
            },
          }),
        })
      );
    });

    it('should filter by date range', async () => {
      mockPrisma.article.findMany.mockResolvedValue([]);
      mockPrisma.article.count.mockResolvedValue(0);

      const request = new NextRequest(
        'http://localhost:3000/api/articles?dateFrom=2024-01-01&dateTo=2024-01-31'
      );
      await GET(request);

      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            publishedAt: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
          }),
        })
      );
    });

    it('should handle search query', async () => {
      mockPrisma.article.findMany.mockResolvedValue([]);
      mockPrisma.article.count.mockResolvedValue(0);

      const request = new NextRequest(
        'http://localhost:3000/api/articles?q=typescript'
      );
      await GET(request);

      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'typescript', mode: 'insensitive' } },
              { summary: { contains: 'typescript', mode: 'insensitive' } },
            ],
          }),
        })
      );
    });

    it('should handle sorting parameters', async () => {
      mockPrisma.article.findMany.mockResolvedValue([]);
      mockPrisma.article.count.mockResolvedValue(0);

      const request = new NextRequest(
        'http://localhost:3000/api/articles?sortBy=popularity&order=desc'
      );
      await GET(request);

      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: expect.any(Object),
        })
      );
    });

    it('should validate limit parameter bounds', async () => {
      mockPrisma.article.findMany.mockResolvedValue([]);
      mockPrisma.article.count.mockResolvedValue(0);

      // Test limit too high
      const request1 = new NextRequest(
        'http://localhost:3000/api/articles?limit=200'
      );
      await GET(request1);

      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100, // Should be capped at 100
        })
      );

      // Test limit too low
      const request2 = new NextRequest(
        'http://localhost:3000/api/articles?limit=0'
      );
      await GET(request2);

      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1, // Should be at least 1
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      mockPrisma.article.findMany.mockRejectedValue(dbError);

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);

      expect(handleApiError).toHaveBeenCalledWith(dbError);
      expect(response.status).toBeGreaterThanOrEqual(500);
    });

    it('should handle invalid date formats', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/articles?dateFrom=invalid-date'
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should include _count for favorites and views', async () => {
      const mockArticleWithCounts = {
        id: '1',
        title: 'Test Article',
        _count: {
          favorites: 10,
          views: 100,
        },
      };

      mockPrisma.article.findMany.mockResolvedValue([mockArticleWithCounts]);
      mockPrisma.article.count.mockResolvedValue(1);

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);
      const data = await response.json();

      expect(data.items[0]).toHaveProperty('_count');
      expect(data.items[0]._count).toEqual({
        favorites: 10,
        views: 100,
      });
    });

    it('should support multiple filters simultaneously', async () => {
      mockPrisma.article.findMany.mockResolvedValue([]);
      mockPrisma.article.count.mockResolvedValue(0);

      const request = new NextRequest(
        'http://localhost:3000/api/articles?' +
        'sources=source1&' +
        'tags=react,typescript&' +
        'dateFrom=2024-01-01&' +
        'q=tutorial&' +
        'page=2&' +
        'limit=20'
      );
      await GET(request);

      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceId: expect.any(Object),
            tags: expect.any(Object),
            publishedAt: expect.any(Object),
            OR: expect.any(Array),
          }),
          skip: 20,
          take: 20,
        })
      );
    });

    it('should return empty results when no articles match', async () => {
      mockPrisma.article.findMany.mockResolvedValue([]);
      mockPrisma.article.count.mockResolvedValue(0);

      const request = new NextRequest(
        'http://localhost:3000/api/articles?tags=nonexistent'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.items).toHaveLength(0);
      expect(data.total).toBe(0);
      expect(data.hasMore).toBe(false);
    });

    it('should handle special characters in search query', async () => {
      mockPrisma.article.findMany.mockResolvedValue([]);
      mockPrisma.article.count.mockResolvedValue(0);

      const request = new NextRequest(
        'http://localhost:3000/api/articles?q=' + encodeURIComponent('C++ & C#')
      );
      await GET(request);

      expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                title: { contains: 'C++ & C#', mode: 'insensitive' },
              }),
            ]),
          }),
        })
      );
    });
  });
});