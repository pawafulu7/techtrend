/**
 * CategoryFilterService Unit Tests
 */

import {
  CategoryFilterService,
  calculateRecencyDecay,
  calculateFinalScore,
  computeWeightedCentroid,
} from '@/lib/personalization/category-filter-service';
import { DEFAULT_SCORE_PARAMETERS } from '@/lib/personalization/types';

// Mock Prisma
const mockPrisma = {
  interestCategory: {
    findMany: jest.fn(),
  },
  userCategoryPreference: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  article: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $transaction: jest.fn((fn: (tx: typeof mockPrisma) => Promise<any>) =>
    fn(mockPrisma)
  ),
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

describe('CategoryFilterService', () => {
  let service: CategoryFilterService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CategoryFilterService(mockPrisma as any);
  });

  // ===========================================================================
  // Pure Function Tests
  // ===========================================================================

  describe('calculateRecencyDecay', () => {
    it("should return 1.0 for today's article", () => {
      const today = new Date();
      const decay = calculateRecencyDecay(today);
      expect(decay).toBeCloseTo(1.0, 2);
    });

    it('should return ~0.5 for article at half-life (365 days)', () => {
      const halfLifeAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const decay = calculateRecencyDecay(halfLifeAgo);
      expect(decay).toBeCloseTo(0.5, 1);
    });

    it('should return ~0.25 for article at 2x half-life (730 days)', () => {
      const twoHalfLivesAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
      const decay = calculateRecencyDecay(twoHalfLivesAgo);
      expect(decay).toBeCloseTo(0.25, 1);
    });

    it('should return 1.0 for future dates', () => {
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const decay = calculateRecencyDecay(future);
      expect(decay).toBe(1.0);
    });

    it('should use custom half-life when provided', () => {
      const sixMonthsAgo = new Date(Date.now() - 182 * 24 * 60 * 60 * 1000);
      const decay = calculateRecencyDecay(sixMonthsAgo, 182); // 182 days half-life
      expect(decay).toBeCloseTo(0.5, 1);
    });
  });

  describe('calculateFinalScore', () => {
    it('should calculate correct score with all components', () => {
      const embeddingSimilarity = 0.8;
      const hasTagMatch = true;
      const recencyDecay = 0.9;

      const score = calculateFinalScore(
        embeddingSimilarity,
        hasTagMatch,
        recencyDecay
      );

      // Expected: 0.8 + 0.03 * 1 + 0.1 * 0.9 = 0.8 + 0.03 + 0.09 = 0.92
      expect(score).toBeCloseTo(0.92, 2);
    });

    it('should not penalize articles without tag match', () => {
      const embeddingSimilarity = 0.8;
      const hasTagMatch = false;
      const recencyDecay = 0.9;

      const score = calculateFinalScore(
        embeddingSimilarity,
        hasTagMatch,
        recencyDecay
      );

      // Expected: 0.8 + 0.03 * 0 + 0.1 * 0.9 = 0.8 + 0 + 0.09 = 0.89
      expect(score).toBeCloseTo(0.89, 2);
    });

    it('should use custom parameters when provided', () => {
      const embeddingSimilarity = 0.8;
      const hasTagMatch = true;
      const recencyDecay = 0.9;
      const customParams = {
        ...DEFAULT_SCORE_PARAMETERS,
        tagBoostAlpha: 0.1,
        recencyBeta: 0.2,
      };

      const score = calculateFinalScore(
        embeddingSimilarity,
        hasTagMatch,
        recencyDecay,
        customParams
      );

      // Expected: 0.8 + 0.1 * 1 + 0.2 * 0.9 = 0.8 + 0.1 + 0.18 = 1.08
      expect(score).toBeCloseTo(1.08, 2);
    });
  });

  describe('computeWeightedCentroid', () => {
    it('should return single centroid unchanged', () => {
      const centroids = ['[0.5,0.5,0.5]'];
      const result = computeWeightedCentroid(centroids);

      // Single centroid should be returned as-is (after parse/stringify)
      expect(result).toBe('[0.5,0.5,0.5]');
    });

    it('should compute average of multiple centroids', () => {
      // Two unit vectors along different axes
      const centroids = ['[1,0,0]', '[0,1,0]'];
      const result = computeWeightedCentroid(centroids);

      // Average: [0.5, 0.5, 0], normalized: [0.707, 0.707, 0]
      const parsed = result
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(Number);
      expect(parsed[0]).toBeCloseTo(0.707, 2);
      expect(parsed[1]).toBeCloseTo(0.707, 2);
      expect(parsed[2]).toBeCloseTo(0, 2);
    });

    it('should apply weights correctly', () => {
      const centroids = ['[1,0,0]', '[0,1,0]'];
      const weights = [3, 1]; // 3:1 ratio, favor first

      const result = computeWeightedCentroid(centroids, weights);
      const parsed = result
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(Number);

      // Weighted average: [0.75, 0.25, 0], normalized
      // Norm = sqrt(0.75^2 + 0.25^2) = sqrt(0.5625 + 0.0625) = sqrt(0.625) ~ 0.79
      // Result: [0.75/0.79, 0.25/0.79, 0] ~ [0.948, 0.316, 0]
      expect(parsed[0]).toBeGreaterThan(parsed[1]);
    });

    it('should throw error for empty centroids array', () => {
      expect(() => computeWeightedCentroid([])).toThrow(
        'No centroids provided'
      );
    });

    it('should throw error for mismatched dimensions', () => {
      const centroids = ['[1,0,0]', '[0,1]'];
      expect(() => computeWeightedCentroid(centroids)).toThrow(
        'Centroid dimensions do not match'
      );
    });

    it('should handle malformed centroid values by converting NaN to 0', () => {
      // 非数値を含むセントロイド（複数セントロイドでNaN置換が走るパスをテスト）
      // NaN は 0 に置換されるため、結果は有限値かつ非NaNになる
      const centroidsWithNonNumeric = ['[0.5,abc,0.5]', '[0.5,0.5,0.5]'];
      const result1 = computeWeightedCentroid(centroidsWithNonNumeric);
      const parsed1 = result1
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(Number);
      expect(isNaN(parsed1[1])).toBe(false);
      expect(isFinite(parsed1[1])).toBe(true);
      expect(parsed1[1]).toBeGreaterThanOrEqual(0);

      // 複数セントロイド加算時の malformed 処理
      const centroidsMixed = ['[1,0,0]', '[0,abc,0]'];
      const result2 = computeWeightedCentroid(centroidsMixed);
      const parsed2 = result2
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(Number);
      expect(isNaN(parsed2[1])).toBe(false);
      expect(parsed2[1]).toBeGreaterThanOrEqual(0);

      // 全要素が malformed なセントロイドと正常なセントロイドの混在
      const centroidsAllBad = ['[abc,abc,abc]', '[0.5,0.5,0.5]'];
      const result3 = computeWeightedCentroid(centroidsAllBad);
      const parsed3 = result3
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(Number);
      expect(parsed3.every((v) => isFinite(v))).toBe(true);
    });

    it('should sanitize NaN in single centroid (early return path)', () => {
      const result = computeWeightedCentroid(['[0.5,abc,0.5]']);
      const parsed = result
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(Number);
      expect(parsed).toEqual([0.5, 0, 0.5]);
    });
  });

  // ===========================================================================
  // Service Method Tests
  // ===========================================================================

  describe('getActiveCategories', () => {
    const mockCategories = [
      {
        id: 'cat-1',
        slug: 'frontend',
        name: 'Frontend',
        description: 'Web UI development',
        icon: 'Monitor',
        sortOrder: 1,
        isActive: true,
      },
      {
        id: 'cat-2',
        slug: 'backend',
        name: 'Backend',
        description: 'Server-side development',
        icon: 'Server',
        sortOrder: 2,
        isActive: true,
      },
    ];

    it('should return active categories', async () => {
      mockPrisma.interestCategory.findMany.mockResolvedValue(mockCategories);

      const result = await service.getActiveCategories();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockCategories[0]);
      expect(result[1]).toEqual(mockCategories[1]);
    });

    it('should return all active categories sorted by sortOrder', async () => {
      mockPrisma.interestCategory.findMany.mockResolvedValue(mockCategories);

      const result = await service.getActiveCategories();

      expect(result[0]).toEqual(mockCategories[0]);
      expect(result[1]).toEqual(mockCategories[1]);
    });
  });

  describe('filterArticles', () => {
    const mockCentroids = [
      { id: 'cat-1', slug: 'frontend', centroid_embedding: '[0.5,0.5,0.5]' },
    ];

    const mockCandidates = [
      {
        id: 'art-1',
        title: 'React Guide',
        url: 'https://example.com/react',
        published_at: new Date(),
        created_at: new Date(),
        quality_score: 0.8,
        bookmarks: 20,
        user_votes: 5,
        source_id: 'src-1',
        summary: 'A guide to React',
        thumbnail_url: null,
        sim_emb: 0.9,
      },
      {
        id: 'art-2',
        title: 'Vue Tutorial',
        url: 'https://example.com/vue',
        published_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        created_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
        quality_score: 0.9,
        bookmarks: 10,
        user_votes: 7,
        source_id: 'src-1',
        summary: 'A Vue tutorial',
        thumbnail_url: null,
        sim_emb: 0.7,
      },
    ];

    it('should filter and score articles correctly', async () => {
      // Mock centroid query
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockCentroids) // getCategoryCentroids
        .mockResolvedValueOnce(mockCandidates) // getEmbeddingCandidates
        .mockResolvedValueOnce([{ article_id: 'art-1' }]); // checkTagMatches

      const result = await service.filterArticles({
        categoryIds: ['cat-1'],
        periodMonths: 12,
        limit: 10,
      });

      expect(result.articles).toHaveLength(2);
      expect(result.articles[0].articleId).toBe('art-1'); // Higher score
      expect(result.articles[0].embeddingSimilarity).toBe(0.9);
      expect(result.meta.filterMode).toBe('category');
      expect(result.meta.appliedCategories).toEqual(['cat-1']);
    });

    it('should use fallback when no centroids found', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]); // No centroids
      mockPrisma.article.count.mockResolvedValue(1);
      mockPrisma.article.findMany.mockResolvedValue([
        { id: 'art-1', publishedAt: new Date() },
      ]);

      const result = await service.filterArticles({
        categoryIds: ['non-existent'],
        periodMonths: 12,
        limit: 10,
      });

      expect(result.articles).toHaveLength(1);
      expect(result.meta.appliedCategories).toEqual([]);
    });

    it('should use fallback when no candidates found', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockCentroids) // getCategoryCentroids
        .mockResolvedValueOnce([]); // No candidates

      mockPrisma.article.count.mockResolvedValue(1);
      mockPrisma.article.findMany.mockResolvedValue([
        { id: 'art-1', publishedAt: new Date() },
      ]);

      const result = await service.filterArticles({
        categoryIds: ['cat-1'],
        periodMonths: 12,
        limit: 10,
      });

      expect(result.articles).toHaveLength(1);
      expect(result.meta.appliedCategories).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      const { logger } = jest.requireMock('@/lib/logger');
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('Database error'));
      mockPrisma.article.count.mockResolvedValue(1);
      mockPrisma.article.findMany.mockResolvedValue([
        { id: 'art-1', publishedAt: new Date() },
      ]);

      const result = await service.filterArticles({
        categoryIds: ['cat-1'],
        periodMonths: 12,
        limit: 10,
      });

      // Should return fallback results
      expect(result.articles).toHaveLength(1);
      expect(result.meta.appliedCategories).toEqual([]);
      // Verify error was logged
      expect(logger.error).toHaveBeenCalled();
    });

    it('should filter by minimum similarity threshold', async () => {
      const lowSimCandidates = [
        { ...mockCandidates[0], sim_emb: 0.6 }, // Above threshold (0.55)
        { ...mockCandidates[1], sim_emb: 0.5 }, // Below threshold
      ];

      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockCentroids)
        .mockResolvedValueOnce(lowSimCandidates)
        .mockResolvedValueOnce([]);

      const result = await service.filterArticles({
        categoryIds: ['cat-1'],
        periodMonths: 12,
        limit: 10,
      });

      // Only one article should pass the threshold
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].embeddingSimilarity).toBe(0.6);
    });

    it('should apply offset correctly', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockCentroids)
        .mockResolvedValueOnce(mockCandidates)
        .mockResolvedValueOnce([]);

      const result = await service.filterArticles({
        categoryIds: ['cat-1'],
        periodMonths: 12,
        limit: 10,
        offset: 1,
      });

      // Should skip first article
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].articleId).toBe('art-2');
    });

    it('should honor sortBy when provided', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockCentroids)
        .mockResolvedValueOnce(mockCandidates)
        .mockResolvedValueOnce([]);

      const result = await service.filterArticles({
        categoryIds: ['cat-1'],
        periodMonths: 12,
        limit: 10,
        sortBy: 'publishedAt',
        sortOrder: 'asc',
      });

      // Older article should come first with ascending publishedAt
      expect(result.articles[0].articleId).toBe('art-2');
      expect(result.articles[1].articleId).toBe('art-1');
    });
  });

  // ===========================================================================
  // Multi-Category OR Behavior Tests
  // ===========================================================================

  describe('filterArticles - multi-category OR behavior', () => {
    const mockMultiCentroids = [
      { id: 'cat-1', slug: 'frontend', centroid_embedding: '[0.5,0.5,0]' },
      { id: 'cat-2', slug: 'backend', centroid_embedding: '[0,0.5,0.5]' },
    ];

    const mockCandidatesFrontend = [
      {
        id: 'art-1',
        title: 'React Guide',
        url: 'https://example.com/react',
        published_at: new Date(),
        created_at: new Date(),
        quality_score: 0.8,
        bookmarks: 20,
        user_votes: 5,
        source_id: 'src-1',
        summary: 'A guide to React',
        thumbnail_url: null,
        sim_emb: 0.9,
      },
      {
        id: 'art-2',
        title: 'Vue Tutorial',
        url: 'https://example.com/vue',
        published_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        created_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
        quality_score: 0.9,
        bookmarks: 10,
        user_votes: 7,
        source_id: 'src-1',
        summary: 'A Vue tutorial',
        thumbnail_url: null,
        sim_emb: 0.6,
      },
    ];

    const mockCandidatesBackend = [
      {
        id: 'art-3',
        title: 'Node.js Guide',
        url: 'https://example.com/node',
        published_at: new Date(),
        created_at: new Date(),
        quality_score: 0.85,
        bookmarks: 15,
        user_votes: 6,
        source_id: 'src-2',
        summary: 'A guide to Node.js',
        thumbnail_url: null,
        sim_emb: 0.85,
      },
      {
        id: 'art-2',
        title: 'Vue Tutorial',
        url: 'https://example.com/vue',
        published_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        created_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
        quality_score: 0.9,
        bookmarks: 10,
        user_votes: 7,
        source_id: 'src-1',
        summary: 'A Vue tutorial',
        thumbnail_url: null,
        sim_emb: 0.7,
      },
    ];

    it('should use max similarity when article appears in multiple category results', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockMultiCentroids)
        .mockResolvedValueOnce(mockCandidatesFrontend)
        .mockResolvedValueOnce(mockCandidatesBackend)
        .mockResolvedValueOnce([]);

      const result = await service.filterArticles({
        categoryIds: ['cat-1', 'cat-2'],
        periodMonths: 12,
        limit: 10,
      });

      // art-2 should have max similarity of 0.7 (from backend), not 0.6 (from frontend)
      const art2 = result.articles.find((a) => a.articleId === 'art-2');
      expect(art2?.embeddingSimilarity).toBe(0.7);

      // Should include articles from both categories
      const articleIds = result.articles.map((a) => a.articleId);
      expect(articleIds).toContain('art-1');
      expect(articleIds).toContain('art-3');
      expect(articleIds).toContain('art-2');

      // Total should be 3 unique articles
      expect(result.articles).toHaveLength(3);
    });

    it('should handle empty results from one category gracefully', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockMultiCentroids)
        .mockResolvedValueOnce(mockCandidatesFrontend)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.filterArticles({
        categoryIds: ['cat-1', 'cat-2'],
        periodMonths: 12,
        limit: 10,
      });

      // Should still return frontend results
      expect(result.articles.length).toBeGreaterThan(0);
      expect(result.articles.map((a) => a.articleId)).toContain('art-1');
    });

    it('should fall back when all category searches return empty', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockMultiCentroids)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockPrisma.article.count.mockResolvedValue(1);
      mockPrisma.article.findMany.mockResolvedValue([
        { id: 'fallback-1', publishedAt: new Date() },
      ]);

      const result = await service.filterArticles({
        categoryIds: ['cat-1', 'cat-2'],
        periodMonths: 12,
        limit: 10,
      });

      // Should return fallback results
      expect(result.meta.appliedCategories).toEqual([]);
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].articleId).toBe('fallback-1');
    });

    it('should pass excludeSourceIds to multi-category search', async () => {
      const excludeSourceIds = ['arxiv-source-id'];
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockMultiCentroids)
        .mockResolvedValueOnce(mockCandidatesFrontend)
        .mockResolvedValueOnce(mockCandidatesBackend)
        .mockResolvedValueOnce([]);

      await service.filterArticles({
        categoryIds: ['cat-1', 'cat-2'],
        periodMonths: 12,
        limit: 10,
        excludeSourceIds,
      });

      // getEmbeddingCandidates is called via $queryRaw (2nd and 3rd calls)
      // $queryRaw receives tagged template args: [stringsArray, ...values]
      // Prisma.sql fragments are passed as objects with {strings, values} structure
      const secondCallValues = mockPrisma.$queryRaw.mock.calls[1].slice(1);
      const thirdCallValues = mockPrisma.$queryRaw.mock.calls[2].slice(1);

      // The sourceExcludeFilter is a Prisma.sql fragment containing the excludeSourceIds
      const findExcludeFragment = (values: unknown[]) =>
        values.find(
          (v): v is { strings: string[]; values: unknown[] } =>
            typeof v === 'object' &&
            v !== null &&
            'strings' in v &&
            'values' in v &&
            (v as { strings: string[] }).strings.some((s: string) =>
              s.includes('"sourceId"')
            )
        );

      const secondFragment = findExcludeFragment(secondCallValues);
      const thirdFragment = findExcludeFragment(thirdCallValues);

      expect(secondFragment).toBeDefined();
      expect(secondFragment!.values).toEqual(
        expect.arrayContaining([excludeSourceIds])
      );
      expect(thirdFragment).toBeDefined();
      expect(thirdFragment!.values).toEqual(
        expect.arrayContaining([excludeSourceIds])
      );
    });

    it('should pass excludeSourceIds to single-category SQL query', async () => {
      const mockSingleCentroids = [
        { id: 'cat-1', slug: 'frontend', centroid_embedding: '[0.5,0.5,0]' },
      ];
      const excludeSourceIds = ['arxiv-source-id'];

      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockSingleCentroids) // getCategoryCentroids
        .mockResolvedValueOnce(mockCandidatesFrontend) // getEmbeddingCandidates
        .mockResolvedValueOnce([]); // checkTagMatches

      await service.filterArticles({
        categoryIds: ['cat-1'],
        periodMonths: 12,
        limit: 10,
        excludeSourceIds,
      });

      // getEmbeddingCandidates is the 2nd $queryRaw call
      const secondCallValues = mockPrisma.$queryRaw.mock.calls[1].slice(1);

      // Find the Prisma.sql fragment containing sourceId exclude filter
      const excludeFragment = secondCallValues.find(
        (v: unknown): v is { strings: string[]; values: unknown[] } =>
          typeof v === 'object' &&
          v !== null &&
          'strings' in v &&
          'values' in v &&
          (v as { strings: string[] }).strings.some((s: string) =>
            s.includes('"sourceId"')
          )
      );

      expect(excludeFragment).toBeDefined();
      expect(excludeFragment!.values).toEqual(
        expect.arrayContaining([excludeSourceIds])
      );
    });

    it('should apply excludeSourceIds to fallback results when no centroids found', async () => {
      const excludeSourceIds = ['arxiv-source-id'];

      mockPrisma.$queryRaw.mockResolvedValueOnce([]); // No centroids
      mockPrisma.article.count.mockResolvedValue(1);
      mockPrisma.article.findMany.mockResolvedValue([
        { id: 'fallback-1', publishedAt: new Date() },
      ]);

      await service.filterArticles({
        categoryIds: ['non-existent'],
        periodMonths: 12,
        limit: 10,
        excludeSourceIds,
      });

      // Verify fallback findMany where clause includes sourceId notIn
      const findManyCall = mockPrisma.article.findMany.mock.calls[0][0];
      expect(findManyCall.where).toEqual(
        expect.objectContaining({
          sourceId: { notIn: excludeSourceIds },
        })
      );
    });

    it('should not add sourceId filter when excludeSourceIds is not specified (backward compatibility)', async () => {
      const mockSingleCentroids = [
        { id: 'cat-1', slug: 'frontend', centroid_embedding: '[0.5,0.5,0]' },
      ];

      // Test embedding path: no excludeSourceIds in SQL
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockSingleCentroids) // getCategoryCentroids
        .mockResolvedValueOnce(mockCandidatesFrontend) // getEmbeddingCandidates
        .mockResolvedValueOnce([]); // checkTagMatches

      await service.filterArticles({
        categoryIds: ['cat-1'],
        periodMonths: 12,
        limit: 10,
        // excludeSourceIds is not specified
      });

      // getEmbeddingCandidates is the 2nd $queryRaw call
      const secondCallValues = mockPrisma.$queryRaw.mock.calls[1].slice(1);

      // When excludeSourceIds is undefined, Prisma.empty is used (no sourceId exclude fragment)
      const excludeFragment = secondCallValues.find(
        (v: unknown): v is { strings: string[]; values: unknown[] } =>
          typeof v === 'object' &&
          v !== null &&
          'strings' in v &&
          'values' in v &&
          (v as { strings: string[] }).strings.some((s: string) =>
            s.includes('!= ALL')
          )
      );
      expect(excludeFragment).toBeUndefined();

      // Test fallback path: no sourceId filter in where clause
      jest.clearAllMocks();
      mockPrisma.$queryRaw.mockResolvedValueOnce([]); // No centroids
      mockPrisma.article.count.mockResolvedValue(1);
      mockPrisma.article.findMany.mockResolvedValue([
        { id: 'fallback-1', publishedAt: new Date() },
      ]);

      await service.filterArticles({
        categoryIds: ['non-existent'],
        periodMonths: 12,
        limit: 10,
        // excludeSourceIds is not specified
      });

      const findManyCall = mockPrisma.article.findMany.mock.calls[0][0];
      expect(findManyCall.where).not.toHaveProperty('sourceId');
    });

    it('should apply excludeSourceIds to fallback when database error occurs', async () => {
      const excludeSourceIds = ['arxiv-source-id'];

      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('Database error'));
      mockPrisma.article.count.mockResolvedValue(1);
      mockPrisma.article.findMany.mockResolvedValue([
        { id: 'fallback-1', publishedAt: new Date() },
      ]);

      await service.filterArticles({
        categoryIds: ['cat-1'],
        periodMonths: 12,
        limit: 10,
        excludeSourceIds,
      });

      // Verify fallback findMany where clause includes sourceId notIn
      const findManyCall = mockPrisma.article.findMany.mock.calls[0][0];
      expect(findManyCall.where).toEqual(
        expect.objectContaining({
          sourceId: { notIn: excludeSourceIds },
        })
      );
    });

    it('should not add sourceId filter when excludeSourceIds is empty array', async () => {
      const mockSingleCentroids = [
        { id: 'cat-1', slug: 'frontend', centroid_embedding: '[0.5,0.5,0]' },
      ];

      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockSingleCentroids) // getCategoryCentroids
        .mockResolvedValueOnce(mockCandidatesFrontend) // getEmbeddingCandidates
        .mockResolvedValueOnce([]); // checkTagMatches

      await service.filterArticles({
        categoryIds: ['cat-1'],
        periodMonths: 12,
        limit: 10,
        excludeSourceIds: [], // empty array
      });

      // getEmbeddingCandidates is the 2nd $queryRaw call
      const secondCallValues = mockPrisma.$queryRaw.mock.calls[1].slice(1);

      // Empty array should not add exclude filter (Prisma.empty is used)
      const excludeFragment = secondCallValues.find(
        (v: unknown): v is { strings: string[]; values: unknown[] } =>
          typeof v === 'object' &&
          v !== null &&
          'strings' in v &&
          'values' in v &&
          (v as { strings: string[] }).strings.some((s: string) =>
            s.includes('!= ALL')
          )
      );
      expect(excludeFragment).toBeUndefined();

      // Test fallback path with empty array
      jest.clearAllMocks();
      mockPrisma.$queryRaw.mockResolvedValueOnce([]); // No centroids
      mockPrisma.article.count.mockResolvedValue(1);
      mockPrisma.article.findMany.mockResolvedValue([
        { id: 'fallback-1', publishedAt: new Date() },
      ]);

      await service.filterArticles({
        categoryIds: ['non-existent'],
        periodMonths: 12,
        limit: 10,
        excludeSourceIds: [], // empty array
      });

      const findManyCall = mockPrisma.article.findMany.mock.calls[0][0];
      expect(findManyCall.where).not.toHaveProperty('sourceId');
    });

    it('should apply tag boost from any matching category (OR)', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockMultiCentroids)
        .mockResolvedValueOnce(mockCandidatesFrontend)
        .mockResolvedValueOnce(mockCandidatesBackend)
        .mockResolvedValueOnce([{ article_id: 'art-1' }]);

      const result = await service.filterArticles({
        categoryIds: ['cat-1', 'cat-2'],
        periodMonths: 12,
        limit: 10,
      });

      // art-1 should have tag boost
      const art1 = result.articles.find((a) => a.articleId === 'art-1');
      expect(art1?.tagBoost).toBeGreaterThan(0);

      // art-3 should not have tag boost
      const art3 = result.articles.find((a) => a.articleId === 'art-3');
      expect(art3?.tagBoost).toBe(0);
    });
  });

  // ===========================================================================
  // topK オプションテスト
  // ===========================================================================

  describe('filterArticles - topK option', () => {
    const mockSingleCentroid = [
      { id: 'cat-1', slug: 'frontend', centroid_embedding: '[0.5,0.5,0]' },
    ];
    const mockMultiCentroids3 = [
      { id: 'cat-1', slug: 'frontend', centroid_embedding: '[0.5,0.5,0]' },
      { id: 'cat-2', slug: 'backend', centroid_embedding: '[0,0.5,0.5]' },
      { id: 'cat-3', slug: 'infra', centroid_embedding: '[0.5,0,0.5]' },
    ];

    const mockCandidatesSimple = [
      {
        id: 'art-1',
        title: 'React Guide',
        url: 'https://example.com/react',
        published_at: new Date(),
        created_at: new Date(),
        quality_score: 0.8,
        bookmarks: 20,
        user_votes: 5,
        source_id: 'src-1',
        summary: 'A guide to React',
        thumbnail_url: null,
        sim_emb: 0.9,
      },
    ];

    it('topK指定時はDEFAULT_TOP_K_CANDIDATESが使われず指定値がgetEmbeddingCandidatesに渡される', async () => {
      // topK=50 を指定する
      // getEmbeddingCandidates は $queryRaw の 2回目の呼び出し（1回目はgetCategoryCentroids）
      // template literal の LIMIT 値として topK=50 が渡される
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockSingleCentroid) // getCategoryCentroids
        .mockResolvedValueOnce(mockCandidatesSimple) // getEmbeddingCandidates
        .mockResolvedValueOnce([]); // checkTagMatches

      await service.filterArticles({
        categoryIds: ['cat-1'],
        periodMonths: 12,
        limit: 5,
        topK: 50,
      });

      // $queryRaw の 2回目呼び出し (index=1) が getEmbeddingCandidates
      // template literal は $queryRaw(strings, ...values) 形式で呼ばれる
      // LIMIT ${effectiveLimit} の値が calls[1] の最後の引数に入る
      const embeddingCandidateCallArgs = mockPrisma.$queryRaw.mock.calls[1];
      // template literalの値 (strings以外の引数) を取得
      const templateValues = embeddingCandidateCallArgs.slice(1);

      // topK=50 が effectiveLimit として LIMIT 句に渡されていることを確認
      // 値は numbers として渡される
      expect(templateValues).toContain(50);
    });

    it('topK未指定時はDEFAULT_TOP_K_CANDIDATES(1000)がLIMITとして渡される', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockSingleCentroid) // getCategoryCentroids
        .mockResolvedValueOnce(mockCandidatesSimple) // getEmbeddingCandidates
        .mockResolvedValueOnce([]); // checkTagMatches

      await service.filterArticles({
        categoryIds: ['cat-1'],
        periodMonths: 12,
        limit: 5,
        // topK: 未指定 → DEFAULT_TOP_K_CANDIDATES = 1000
      });

      const embeddingCandidateCallArgs = mockPrisma.$queryRaw.mock.calls[1];
      const templateValues = embeddingCandidateCallArgs.slice(1);

      // DEFAULT_TOP_K_CANDIDATES=1000 が LIMIT 句に渡される
      expect(templateValues).toContain(1000);
    });

    it('topK指定時はmulti-categoryでtopKが総予算としてperCategoryに分配される', async () => {
      // topK=90, 3カテゴリ → kPerCategory = Math.max(30, Math.floor(90/3)) = Math.max(30, 30) = 30
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockMultiCentroids3) // getCategoryCentroids
        .mockResolvedValueOnce(mockCandidatesSimple) // cat-1 getEmbeddingCandidates
        .mockResolvedValueOnce(mockCandidatesSimple) // cat-2 getEmbeddingCandidates
        .mockResolvedValueOnce(mockCandidatesSimple) // cat-3 getEmbeddingCandidates
        .mockResolvedValueOnce([]); // checkTagMatches

      await service.filterArticles({
        categoryIds: ['cat-1', 'cat-2', 'cat-3'],
        periodMonths: 12,
        limit: 10,
        topK: 90,
      });

      // $queryRaw の 2〜4回目が各カテゴリのgetEmbeddingCandidates
      // それぞれ kPerCategory=30 が LIMIT として渡されることを確認
      for (const callIndex of [1, 2, 3]) {
        const callArgs = mockPrisma.$queryRaw.mock.calls[callIndex];
        const templateValues = callArgs.slice(1);
        expect(templateValues).toContain(30);
      }
    });

    it('topK指定時のperCategory分配: topKがカテゴリ数より少なくても最低30が保証される', async () => {
      // topK=10, 3カテゴリ → kPerCategory = Math.max(30, Math.floor(10/3)) = Math.max(30, 3) = 30
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockMultiCentroids3) // getCategoryCentroids
        .mockResolvedValueOnce(mockCandidatesSimple) // cat-1
        .mockResolvedValueOnce(mockCandidatesSimple) // cat-2
        .mockResolvedValueOnce(mockCandidatesSimple) // cat-3
        .mockResolvedValueOnce([]); // checkTagMatches

      await service.filterArticles({
        categoryIds: ['cat-1', 'cat-2', 'cat-3'],
        periodMonths: 12,
        limit: 10,
        topK: 10,
      });

      // 最低30が保証される
      for (const callIndex of [1, 2, 3]) {
        const callArgs = mockPrisma.$queryRaw.mock.calls[callIndex];
        const templateValues = callArgs.slice(1);
        expect(templateValues).toContain(30);
      }
    });
  });

  // ===========================================================================
  // maxConcurrency オプションテスト
  // ===========================================================================

  describe('filterArticles - maxConcurrency option', () => {
    const mockCandidatesFrontend = [
      {
        id: 'art-1',
        title: 'React Guide',
        url: 'https://example.com/react',
        published_at: new Date(),
        created_at: new Date(),
        quality_score: 0.8,
        bookmarks: 20,
        user_votes: 5,
        source_id: 'src-1',
        summary: 'A guide to React',
        thumbnail_url: null,
        sim_emb: 0.9,
      },
    ];
    const mockCandidatesBackend = [
      {
        id: 'art-2',
        title: 'Node Guide',
        url: 'https://example.com/node',
        published_at: new Date(),
        created_at: new Date(),
        quality_score: 0.85,
        bookmarks: 15,
        user_votes: 3,
        source_id: 'src-2',
        summary: 'Node guide',
        thumbnail_url: null,
        sim_emb: 0.85,
      },
    ];
    const mockCandidatesInfra = [
      {
        id: 'art-3',
        title: 'K8s Guide',
        url: 'https://example.com/k8s',
        published_at: new Date(),
        created_at: new Date(),
        quality_score: 0.8,
        bookmarks: 10,
        user_votes: 2,
        source_id: 'src-3',
        summary: 'K8s guide',
        thumbnail_url: null,
        sim_emb: 0.8,
      },
    ];

    const mockCentroids3 = [
      { id: 'cat-1', slug: 'frontend', centroid_embedding: '[0.5,0.5,0]' },
      { id: 'cat-2', slug: 'backend', centroid_embedding: '[0,0.5,0.5]' },
      { id: 'cat-3', slug: 'infra', centroid_embedding: '[0.5,0,0.5]' },
    ];

    it('maxConcurrency指定時もカテゴリ数 > maxConcurrency で全カテゴリの結果が返る', async () => {
      // 3カテゴリ, maxConcurrency=2 → 順次処理されるが最終的に全結果がマージされる
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockCentroids3) // getCategoryCentroids
        .mockResolvedValueOnce(mockCandidatesFrontend) // cat-1
        .mockResolvedValueOnce(mockCandidatesBackend) // cat-2
        .mockResolvedValueOnce(mockCandidatesInfra) // cat-3
        .mockResolvedValueOnce([]); // checkTagMatches

      const result = await service.filterArticles({
        categoryIds: ['cat-1', 'cat-2', 'cat-3'],
        periodMonths: 12,
        limit: 10,
        maxConcurrency: 2,
      });

      // 全3カテゴリの記事が取得され、ユニーク3件になる
      const articleIds = result.articles.map((a) => a.articleId);
      expect(articleIds).toContain('art-1');
      expect(articleIds).toContain('art-2');
      expect(articleIds).toContain('art-3');
      expect(result.articles).toHaveLength(3);
    });

    it('maxConcurrency >= カテゴリ数の場合はPromise.allSettledで並列実行され全結果が返る', async () => {
      // 2カテゴリ, maxConcurrency=5 → maxConcurrency >= centroids.length なので通常のPromise.allSettled
      const mockCentroids2 = [
        { id: 'cat-1', slug: 'frontend', centroid_embedding: '[0.5,0.5,0]' },
        { id: 'cat-2', slug: 'backend', centroid_embedding: '[0,0.5,0.5]' },
      ];

      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockCentroids2) // getCategoryCentroids
        .mockResolvedValueOnce(mockCandidatesFrontend) // cat-1
        .mockResolvedValueOnce(mockCandidatesBackend) // cat-2
        .mockResolvedValueOnce([]); // checkTagMatches

      const result = await service.filterArticles({
        categoryIds: ['cat-1', 'cat-2'],
        periodMonths: 12,
        limit: 10,
        maxConcurrency: 5,
      });

      expect(result.articles).toHaveLength(2);
      const articleIds = result.articles.map((a) => a.articleId);
      expect(articleIds).toContain('art-1');
      expect(articleIds).toContain('art-2');
    });

    it('maxConcurrency指定時にカテゴリ検索が一部失敗しても他のカテゴリ結果は返る', async () => {
      const { logger } = jest.requireMock('@/lib/logger');

      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockCentroids3) // getCategoryCentroids
        .mockResolvedValueOnce(mockCandidatesFrontend) // cat-1: 成功
        .mockRejectedValueOnce(new Error('DB error')) // cat-2: 失敗
        .mockResolvedValueOnce(mockCandidatesInfra) // cat-3: 成功
        .mockResolvedValueOnce([]); // checkTagMatches

      const result = await service.filterArticles({
        categoryIds: ['cat-1', 'cat-2', 'cat-3'],
        periodMonths: 12,
        limit: 10,
        maxConcurrency: 2,
      });

      // cat-2 は失敗するが cat-1, cat-3 の結果は取得できる
      const articleIds = result.articles.map((a) => a.articleId);
      expect(articleIds).toContain('art-1');
      expect(articleIds).toContain('art-3');
      expect(articleIds).not.toContain('art-2');

      // 失敗がwarnとして記録される
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
