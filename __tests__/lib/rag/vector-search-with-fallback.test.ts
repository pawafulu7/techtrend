import {
  VectorSearchService,
  SearchResult,
} from '@/lib/rag/vector-search-service';
import { PrismaClient } from '@prisma/client';
import { EmbeddingService } from '@/lib/rag/embedding-service';

describe('VectorSearchService.searchWithFallback', () => {
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockEmbeddingService: jest.Mocked<EmbeddingService>;
  let service: VectorSearchService;

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: jest.fn(),
    } as any;

    mockEmbeddingService = {
      embedText: jest.fn(),
    } as any;

    service = new VectorSearchService(mockPrisma, mockEmbeddingService);
  });

  describe('enableFallback=false', () => {
    it('should return results without fallback', async () => {
      const mockResults: SearchResult[] = [
        {
          articleId: 'test-1',
          title: 'Test Article',
          summary: 'Summary',
          translatedTitle: null,
          similarity: 0.6,
          publishedAt: new Date(),
          sourceId: 'source-1',
          embeddingKey: 'summary',
        },
      ];

      mockEmbeddingService.embedText.mockResolvedValue(
        new Array(1536).fill(0.5)
      );
      mockPrisma.$queryRaw.mockResolvedValue(mockResults);

      const { results, metadata } = await service.searchWithFallback(
        'Test Query',
        {
          enableFallback: false,
        }
      );

      expect(results).toEqual(mockResults);
      expect(metadata.phase).toBeNull();
      expect(metadata.attemptCount).toBe(1);
      expect(metadata.usedFallback).toBe(false);
    });
  });

  describe('enableFallback=true', () => {
    it('should succeed at first threshold when enough results', async () => {
      const mockResults: SearchResult[] = Array.from({ length: 5 }, (_, i) => ({
        articleId: `test-${i}`,
        title: `Article ${i}`,
        summary: 'Summary',
        translatedTitle: null,
        similarity: 0.6 - i * 0.05,
        publishedAt: new Date(),
        sourceId: 'source-1',
        embeddingKey: 'summary',
      }));

      mockEmbeddingService.embedText.mockResolvedValue(
        new Array(1536).fill(0.5)
      );
      mockPrisma.$queryRaw.mockResolvedValue(mockResults);

      const { results, metadata } = await service.searchWithFallback(
        'Popular Topic',
        {
          enableFallback: true,
        }
      );

      expect(results.length).toBeGreaterThanOrEqual(3);
      expect(metadata.phase).toBe(1);
      expect(metadata.finalThreshold).toBe(0.55);
      expect(metadata.attemptCount).toBe(1);
      expect(metadata.usedFallback).toBe(false);
    });

    it('should fallback to lower threshold when initial fails', async () => {
      mockEmbeddingService.embedText.mockResolvedValue(
        new Array(1536).fill(0.5)
      );

      let callCount = 0;
      mockPrisma.$queryRaw.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          return [];
        }
        return Array.from({ length: 4 }, (_, i) => ({
          articleId: `test-${i}`,
          title: `Article ${i}`,
          summary: 'Summary',
          translatedTitle: null,
          similarity: 0.47 - i * 0.01,
          publishedAt: new Date(),
          sourceId: 'source-1',
          embeddingKey: 'summary',
        }));
      });

      const { results, metadata } = await service.searchWithFallback(
        'Niche Topic',
        {
          enableFallback: true,
        }
      );

      expect(results.length).toBeGreaterThanOrEqual(3);
      expect(metadata.phase).toBe(1);
      expect(metadata.finalThreshold).toBe(0.45);
      expect(metadata.attemptCount).toBe(3);
      expect(metadata.usedFallback).toBe(true);
    });

    it('should return results at 0.35 when all thresholds fail', async () => {
      const mockResults: SearchResult[] = [
        {
          articleId: 'test-1',
          title: 'Very Niche Article',
          summary: 'Summary',
          translatedTitle: null,
          similarity: 0.36,
          publishedAt: new Date(),
          sourceId: 'source-1',
          embeddingKey: 'summary',
        },
      ];

      mockEmbeddingService.embedText.mockResolvedValue(
        new Array(1536).fill(0.5)
      );

      let callCount = 0;
      mockPrisma.$queryRaw.mockImplementation(async () => {
        callCount++;
        if (callCount < 6) {
          return [];
        }
        return mockResults;
      });

      const { results, metadata } = await service.searchWithFallback(
        'Very Niche Topic',
        {
          enableFallback: true,
        }
      );

      expect(metadata.phase).toBe(1);
      expect(metadata.finalThreshold).toBe(0.35);
      expect(metadata.attemptCount).toBe(6);
      expect(metadata.usedFallback).toBe(true);
    });

    it('should include metadata fields', async () => {
      mockEmbeddingService.embedText.mockResolvedValue(
        new Array(1536).fill(0.5)
      );
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const { metadata } = await service.searchWithFallback('Test', {
        enableFallback: true,
      });

      expect(metadata).toHaveProperty('phase');
      expect(metadata).toHaveProperty('finalThreshold');
      expect(metadata).toHaveProperty('attemptCount');
      expect(metadata).toHaveProperty('usedFallback');
    });

    it('should call embedText exactly once even when all 6 thresholds are exhausted', async () => {
      mockEmbeddingService.embedText.mockResolvedValue(
        new Array(1536).fill(0.5)
      );
      // Always return empty results to force all 6 threshold attempts
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const { metadata } = await service.searchWithFallback(
        'Very Niche Topic',
        {
          enableFallback: true,
        }
      );

      // embedText should be called only once regardless of threshold loop iterations
      expect(mockEmbeddingService.embedText).toHaveBeenCalledTimes(1);
      // All 6 thresholds [0.55, 0.50, 0.45, 0.40, 0.375, 0.35] should have been tried
      expect(metadata.attemptCount).toBe(6);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(6);
    });

    it('should call embedText exactly once when results found at first threshold', async () => {
      const mockResults = Array.from({ length: 5 }, (_, i) => ({
        articleId: `test-${i}`,
        title: `Article ${i}`,
        summary: 'Summary',
        translatedTitle: null,
        similarity: 0.6 - i * 0.01,
        publishedAt: new Date(),
        sourceId: 'source-1',
        embeddingKey: 'summary',
      }));

      mockEmbeddingService.embedText.mockResolvedValue(
        new Array(1536).fill(0.5)
      );
      mockPrisma.$queryRaw.mockResolvedValue(mockResults);

      await service.searchWithFallback('Popular Topic', {
        enableFallback: true,
      });

      // embedText should be called only once even when results found immediately
      expect(mockEmbeddingService.embedText).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });
});
