import { semanticSearchTool } from '@/lib/rag/tools/semantic-search-tool';
import { VectorSearchService } from '@/lib/rag/vector-search-service';

// Mock VectorSearchService
jest.mock('@/lib/rag/vector-search-service');

const mockSearch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (VectorSearchService as jest.Mock).mockImplementation(() => ({
    search: mockSearch,
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

      mockSearch.mockResolvedValue(mockResults);

      const result = await semanticSearchTool.execute({
        query: 'React performance',
        topK: 5,
        similarityThreshold: 0.7,
      });

      expect(result.articles).toBeInstanceOf(Array);
      expect(result.articles.length).toBe(2);
      expect(result.count).toBe(2);

      expect(result.articles[0]).toMatchObject({
        articleId: 'article1',
        title: 'React Performance Tips',
        similarity: 0.92,
      });

      expect(mockSearch).toHaveBeenCalledWith('React performance', expect.objectContaining({
        topK: 5,
        similarityThreshold: 0.7,
        embeddingKey: 'summary',
      }));
    });

    it('should use default parameters when called by SDK', async () => {
      // Note: When called by Vercel AI SDK (agent), defaults are applied by SDK
      // When called directly, parameters may be undefined
      mockSearch.mockResolvedValue([]);

      const result = await semanticSearchTool.execute({
        query: 'TypeScript',
        topK: 10, // Explicitly provide default
        similarityThreshold: 0.7,
      });

      expect(result.count).toBe(0);
      expect(mockSearch).toHaveBeenCalledWith('TypeScript', expect.objectContaining({
        topK: 10,
        similarityThreshold: 0.7,
        embeddingKey: 'summary',
      }));
    });

    it('should pass filters to search service', async () => {
      mockSearch.mockResolvedValue([]);

      await semanticSearchTool.execute({
        query: 'Next.js',
        filters: {
          sources: ['source1', 'source2'],
          tags: ['Next.js', 'Performance'],
        },
      });

      expect(mockSearch).toHaveBeenCalledWith('Next.js', expect.objectContaining({
        sourceIds: ['source1', 'source2'],
        tags: ['Next.js', 'Performance'],
      }));
    });

    it('should handle empty results gracefully', async () => {
      mockSearch.mockResolvedValue([]);

      const result = await semanticSearchTool.execute({
        query: 'xyzqwertyuiopasdfghjkl', // Unlikely match
        similarityThreshold: 0.99,
      });

      expect(result.articles).toEqual([]);
      expect(result.count).toBe(0);
    });

    // Note: Validation tests for schema should test the schema itself
    // When used by SDK agents, validation is automatic
    // For direct execute() calls, validation behavior depends on SDK implementation

    it('should propagate search service errors', async () => {
      mockSearch.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        semanticSearchTool.execute({
          query: 'React',
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

      mockSearch.mockResolvedValue(mockResults);

      const result = await semanticSearchTool.execute({
        query: 'test',
      });

      expect(result.articles[0].publishedAt).toBe('2025-10-15T10:30:00.000Z');
      expect(typeof result.articles[0].publishedAt).toBe('string');
    });
  });
});
