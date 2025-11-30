/**
 * CentroidService Unit Tests
 */

import { CentroidService } from '@/lib/personalization/centroid-service';

// Mock Prisma
const mockPrisma = {
  interestCategory: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
};

jest.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  sanitizeError: (e: Error) => ({ message: e.message }),
}));

describe('CentroidService', () => {
  let service: CentroidService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CentroidService(mockPrisma as any);
  });

  describe('computeAllCentroids', () => {
    const mockCategories = [
      { id: 'cat-1', slug: 'frontend' },
      { id: 'cat-2', slug: 'backend' },
    ];

    const mockCentroidResults = [
      { category_id: 'cat-1', centroid: '[0.1,0.2,0.3]', sample_count: BigInt(100) },
      { category_id: 'cat-2', centroid: '[0.4,0.5,0.6]', sample_count: BigInt(50) },
    ];

    it('should compute centroids for all active categories', async () => {
      mockPrisma.interestCategory.findMany.mockResolvedValue(mockCategories);
      mockPrisma.$queryRaw.mockResolvedValue(mockCentroidResults);
      mockPrisma.$executeRaw.mockResolvedValue(1);

      const results = await service.computeAllCentroids();

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        categoryId: 'cat-1',
        success: true,
        sampleCount: 100,
      });
      expect(results[1]).toEqual({
        categoryId: 'cat-2',
        success: true,
        sampleCount: 50,
      });

      // Verify UPDATE was called for each category
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
    });

    it('should not write to DB in dry run mode', async () => {
      mockPrisma.interestCategory.findMany.mockResolvedValue(mockCategories);
      mockPrisma.$queryRaw.mockResolvedValue(mockCentroidResults);

      const results = await service.computeAllCentroids({ dryRun: true });

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);

      // Verify UPDATE was NOT called
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('should handle categories with no articles', async () => {
      const categoriesWithEmpty = [
        { id: 'cat-1', slug: 'frontend' },
        { id: 'cat-empty', slug: 'empty' },
      ];

      mockPrisma.interestCategory.findMany.mockResolvedValue(categoriesWithEmpty);
      mockPrisma.$queryRaw.mockResolvedValue([
        { category_id: 'cat-1', centroid: '[0.1,0.2,0.3]', sample_count: BigInt(100) },
        // cat-empty has no results
      ]);
      mockPrisma.$executeRaw.mockResolvedValue(1);

      const results = await service.computeAllCentroids();

      expect(results).toHaveLength(2);

      // cat-1 succeeded
      expect(results[0]).toEqual({
        categoryId: 'cat-1',
        success: true,
        sampleCount: 100,
      });

      // cat-empty failed (no articles)
      expect(results[1]).toEqual({
        categoryId: 'cat-empty',
        success: false,
        sampleCount: 0,
        error: 'No articles with embeddings found for this category',
      });

      // UPDATE called only once (for cat-1)
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('computeCategoryCentroid', () => {
    it('should compute centroid for a single category', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { category_id: 'cat-1', centroid: '[0.1,0.2,0.3]', sample_count: BigInt(100) },
      ]);
      mockPrisma.$executeRaw.mockResolvedValue(1);

      const result = await service.computeCategoryCentroid('cat-1');

      expect(result).toEqual({
        categoryId: 'cat-1',
        success: true,
        sampleCount: 100,
      });

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('should handle category with no articles', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.computeCategoryCentroid('cat-empty');

      expect(result).toEqual({
        categoryId: 'cat-empty',
        success: false,
        sampleCount: 0,
        error: 'No articles with embeddings found for this category',
      });

      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Database connection failed'));

      const result = await service.computeCategoryCentroid('cat-1');

      expect(result).toEqual({
        categoryId: 'cat-1',
        success: false,
        error: 'Database connection failed',
      });
    });
  });

  describe('getCentroidStats', () => {
    it('should return correct statistics', async () => {
      const oldDate = new Date('2024-01-01');
      const newDate = new Date('2024-06-01');

      mockPrisma.interestCategory.count
        .mockResolvedValueOnce(7) // total
        .mockResolvedValueOnce(5); // withCentroid

      mockPrisma.interestCategory.findFirst
        .mockResolvedValueOnce({ centroidComputedAt: oldDate }) // oldest
        .mockResolvedValueOnce({ centroidComputedAt: newDate }); // newest

      const stats = await service.getCentroidStats();

      expect(stats).toEqual({
        totalCategories: 7,
        categoriesWithCentroid: 5,
        categoriesWithoutCentroid: 2,
        oldestCentroid: oldDate,
        newestCentroid: newDate,
      });
    });

    it('should handle no centroids computed yet', async () => {
      mockPrisma.interestCategory.count
        .mockResolvedValueOnce(7) // total
        .mockResolvedValueOnce(0); // withCentroid

      mockPrisma.interestCategory.findFirst
        .mockResolvedValueOnce(null) // oldest
        .mockResolvedValueOnce(null); // newest

      const stats = await service.getCentroidStats();

      expect(stats).toEqual({
        totalCategories: 7,
        categoriesWithCentroid: 0,
        categoriesWithoutCentroid: 7,
        oldestCentroid: null,
        newestCentroid: null,
      });
    });
  });
});
