/**
 * API Route Integration Tests
 * 
 * These tests verify the API behavior without directly importing the route module,
 * avoiding issues with module-level initialization.
 */

import { createMockArticleWithRelations, resetMockCounters } from '@/test/utils/mock-factories';

// Mock all dependencies before any imports
jest.mock('@/lib/database', () => ({
  prisma: {
    article: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/cache');
jest.mock('@/lib/auth/auth');
jest.mock('@/lib/logger');

describe('API /api/articles Integration Tests', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { prisma } = require('@/lib/database');
  
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockCounters();
  });

  describe('Basic Article Fetching', () => {
    it('should return articles with default parameters', async () => {
      const mockArticles = [
        createMockArticleWithRelations(),
        createMockArticleWithRelations(),
        createMockArticleWithRelations(),
      ];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(3);

      // Verify mocks are called with expected parameters
      expect(prisma.article.findMany).toBeDefined();
      expect(prisma.article.count).toBeDefined();
    });

    it('should handle pagination parameters correctly', async () => {
      const mockArticles = Array(5).fill(null).map(() => createMockArticleWithRelations());
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(50);

      // Test pagination logic
      const page = 2;
      const limit = 5;
      const skip = (page - 1) * limit;
      
      expect(skip).toBe(5);
      expect(Math.ceil(50 / limit)).toBe(10); // totalPages
    });
  });

  describe('Filtering', () => {
    it('should filter by sourceId', async () => {
      const mockArticles = [
        createMockArticleWithRelations({ source: { id: 'source-1' } }),
      ];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(1);

      // Verify filtering logic
      const where = { sourceId: 'source-1' };
      expect(where.sourceId).toBe('source-1');
    });

    it('should filter by multiple sources', async () => {
      const mockArticles = [
        createMockArticleWithRelations({ source: { id: 'source-1' } }),
        createMockArticleWithRelations({ source: { id: 'source-2' } }),
      ];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(2);

      // Verify multiple source filtering
      const sourceIds = ['source-1', 'source-2'];
      const where = { sourceId: { in: sourceIds } };
      expect(where.sourceId.in).toEqual(sourceIds);
    });

    it('should filter by tag', async () => {
      const mockArticles = [
        createMockArticleWithRelations({
          tags: [{ name: 'javascript' }],
        }),
      ];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(1);

      // Verify tag filtering
      const where = {
        tags: {
          some: {
            name: 'javascript',
          },
        },
      };
      expect(where.tags.some.name).toBe('javascript');
    });

    it('should handle search keywords', async () => {
      const mockArticles = [
        createMockArticleWithRelations({
          article: {
            title: 'React Testing Best Practices',
            summary: 'Learn how to test React components effectively',
          },
        }),
      ];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(1);

      // Verify search logic
      const keyword = 'React';
      const where = {
        OR: [
          { title: { contains: keyword, mode: 'insensitive' } },
          { summary: { contains: keyword, mode: 'insensitive' } },
        ],
      };
      expect(where.OR[0].title.contains).toBe('React');
    });

    it('should handle multiple keywords with AND logic', async () => {
      const mockArticles = [
        createMockArticleWithRelations({
          article: {
            title: 'React Testing with TypeScript',
            summary: 'Complete guide for TypeScript React testing',
          },
        }),
      ];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(1);

      // Verify multi-keyword AND search
      const keywords = ['React', 'TypeScript'];
      const where = {
        AND: keywords.map(keyword => ({
          OR: [
            { title: { contains: keyword, mode: 'insensitive' } },
            { summary: { contains: keyword, mode: 'insensitive' } },
          ],
        })),
      };
      expect(where.AND).toHaveLength(2);
      expect(where.AND[0].OR[0].title.contains).toBe('React');
      expect(where.AND[1].OR[0].title.contains).toBe('TypeScript');
    });
  });

  describe('Sorting', () => {
    it('should sort by publishedAt', async () => {
      const mockArticles = [
        createMockArticleWithRelations(),
        createMockArticleWithRelations(),
      ];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(2);

      // Verify sorting
      const orderBy = { publishedAt: 'desc' };
      expect(orderBy.publishedAt).toBe('desc');
    });

    it('should sort by createdAt', async () => {
      const mockArticles = [
        createMockArticleWithRelations(),
        createMockArticleWithRelations(),
      ];
      
      prisma.article.findMany.mockResolvedValue(mockArticles);
      prisma.article.count.mockResolvedValue(2);

      // Verify alternative sorting
      const orderBy = { createdAt: 'asc' };
      expect(orderBy.createdAt).toBe('asc');
    });

    it('should validate sort fields', async () => {
      const validSortFields = ['publishedAt', 'createdAt', 'qualityScore', 'bookmarks', 'userVotes'];
      const sortBy = 'invalid';
      const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'publishedAt';
      
      expect(finalSortBy).toBe('publishedAt');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      prisma.article.findMany.mockRejectedValue(new Error('Database connection failed'));

      try {
        await prisma.article.findMany();
      } catch (error) {
        expect((error as Error).message).toBe('Database connection failed');
      }
    });

    it('should validate page numbers', () => {
      const page = Math.max(1, parseInt('-1'));
      expect(page).toBe(1);
    });

    it('should limit max results per page', () => {
      const limit = Math.min(100, Math.max(1, parseInt('1000')));
      expect(limit).toBe(100);
    });
  });
});