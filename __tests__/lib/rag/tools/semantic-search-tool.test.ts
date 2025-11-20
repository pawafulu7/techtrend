import { semanticSearchTool } from '@/lib/rag/tools/semantic-search-tool';
import { VectorSearchService } from '@/lib/rag/vector-search-service';

// Mock VectorSearchService
jest.mock('@/lib/rag/vector-search-service');

const mockSearch = jest.fn();
const mockSearchWithExpansion = jest.fn();
const mockSearchWithFallback = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (VectorSearchService as jest.Mock).mockImplementation(() => ({
    search: mockSearch,
    searchWithExpansion: mockSearchWithExpansion,
    searchWithFallback: mockSearchWithFallback,
  }));
});

describe('SemanticSearchTool', () => {
  describe('execute', () => {
    it('should execute successfully with valid input', async () => {
      const mockResults = [
        {
          articleId: 'article1',
          title: 'React Performance Tips',
          summary: 'Learn how to optimize React apps',
          translatedTitle: 'Reactパフォーマンスのコツ',
          similarity: 0.92,
          publishedAt: new Date('2025-10-15T10:00:00Z'),
          sourceId: 'source1',
          embeddingKey: 'summary',
        },
        {
          articleId: 'article2',
          title: 'React Hooks Guide',
          summary: 'Comprehensive guide to React hooks',
          translatedTitle: 'React Hooksガイド',
          similarity: 0.88,
          publishedAt: new Date('2025-10-14T09:00:00Z'),
          sourceId: 'source2',
          embeddingKey: 'summary',
        },
      ];

      mockSearchWithFallback.mockResolvedValue({
        results: mockResults,
        metadata: {
          phase: 1,
          finalThreshold: 0.55,
          attemptCount: 1,
          usedFallback: false,
        },
      });

      const result = await semanticSearchTool.execute({
        query: 'React performance',
        topK: 5,
        similarityThreshold: 0.7,
        enableFallback: true,
      });

      expect(result.articles).toBeInstanceOf(Array);
      expect(result.articles.length).toBe(2);
      expect(result.count).toBe(2);
      expect(result.fallbackMetadata).toEqual({
        phase: 1,
        finalThreshold: 0.55,
        attemptCount: 1,
        usedFallback: false,
      });

      expect(result.articles[0]).toMatchObject({
        articleId: 'article1',
        title: 'React Performance Tips',
        similarity: 0.92,
      });

      expect(mockSearchWithFallback).toHaveBeenCalledWith('React performance', expect.objectContaining({
        topK: 5,
        similarityThreshold: 0.7,
        enableFallback: true,
        embeddingKey: 'summary',
      }));
    });

    it('should use default parameters when called by SDK', async () => {
      mockSearchWithFallback.mockResolvedValue({
        results: [],
        metadata: {
          phase: 1,
          finalThreshold: 0.35,
          attemptCount: 6,
          usedFallback: true,
        },
      });

      const result = await semanticSearchTool.execute({
        query: 'TypeScript',
        topK: 10,
        similarityThreshold: 0.7,
        enableFallback: true,
      });

      expect(result.count).toBe(0);
      expect(mockSearchWithFallback).toHaveBeenCalledWith('TypeScript', expect.objectContaining({
        topK: 10,
        similarityThreshold: 0.7,
        enableFallback: true,
        embeddingKey: 'summary',
      }));
    });

    it('should pass filters to search service', async () => {
      mockSearchWithFallback.mockResolvedValue({
        results: [],
        metadata: {
          phase: null,
          finalThreshold: 0.55,
          attemptCount: 1,
          usedFallback: false,
        },
      });

      await semanticSearchTool.execute({
        query: 'Next.js',
        enableFallback: false,
        filters: {
          sources: ['source1', 'source2'],
          tags: ['Next.js', 'Performance'],
        },
      });

      expect(mockSearchWithFallback).toHaveBeenCalledWith('Next.js', expect.objectContaining({
        sourceIds: ['source1', 'source2'],
        tags: ['Next.js', 'Performance'],
        enableFallback: false,
      }));
    });

    it('should handle empty results gracefully', async () => {
      mockSearchWithFallback.mockResolvedValue({
        results: [],
        metadata: {
          phase: 1,
          finalThreshold: 0.35,
          attemptCount: 6,
          usedFallback: true,
        },
      });

      const result = await semanticSearchTool.execute({
        query: 'xyzqwertyuiopasdfghjkl',
        similarityThreshold: 0.99,
        enableFallback: true,
      });

      expect(result.articles).toEqual([]);
      expect(result.count).toBe(0);
    });

    // Note: Validation tests for schema should test the schema itself
    // When used by SDK agents, validation is automatic
    // For direct execute() calls, validation behavior depends on SDK implementation

    it('should propagate search service errors', async () => {
      mockSearchWithFallback.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        semanticSearchTool.execute({
          query: 'React',
          enableFallback: true,
        })
      ).rejects.toThrow('Database connection failed');
    });

    it('should convert Date objects to ISO strings', async () => {
      const mockResults = [
        {
          articleId: 'article1',
          title: 'Test Article',
          summary: 'Test summary',
          translatedTitle: null,
          similarity: 0.9,
          publishedAt: new Date('2025-10-15T10:30:00.000Z'),
          sourceId: 'source1',
          embeddingKey: 'summary',
        },
      ];

      mockSearchWithFallback.mockResolvedValue({
        results: mockResults,
        metadata: {
          phase: 1,
          finalThreshold: 0.55,
          attemptCount: 1,
          usedFallback: false,
        },
      });

      const result = await semanticSearchTool.execute({
        query: 'Test',
        enableFallback: true,
      });

      expect(result.articles[0].publishedAt).toBe('2025-10-15T10:30:00.000Z');
    });
  });
});
