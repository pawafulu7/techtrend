import { articleContextTool } from '@/lib/rag/tools/article-context-tool';
import { prisma } from '@/lib/prisma';
import { EmbeddingService } from '@/lib/rag/embedding-service';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    article: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/rag/embedding-service');

const mockFindUnique = prisma.article.findUnique as jest.Mock;
const mockEmbedText = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (EmbeddingService as jest.Mock).mockImplementation(() => ({
    embedText: mockEmbedText,
  }));
});

describe('ArticleContextTool', () => {
  describe('execute', () => {
    it('should extract chunks from article with detailed summary', async () => {
      const mockArticle = {
        id: 'article1',
        title: 'React Performance Tips',
        url: 'https://example.com/react-perf',
        sourceId: 'source1',
        publishedAt: new Date('2025-10-15T10:00:00Z'),
        content: '<p>React performance optimization requires understanding of rendering behavior.</p><p>Use React.memo to prevent unnecessary re-renders.</p>'.repeat(20), // Make it long enough to chunk
        detailedSummary: '<p>Comprehensive guide to React performance optimization techniques.</p>',
      };

      mockFindUnique.mockResolvedValue(mockArticle);

      // Mock embeddings
      mockEmbedText.mockImplementation(async (text: string) => {
        // Return different embeddings based on text content
        if (text.includes('performance')) {
          return new Array(1536).fill(0.9); // High similarity
        }
        return new Array(1536).fill(0.3); // Lower similarity
      });

      const result = await articleContextTool.execute({
        articleId: 'article1',
        query: 'React performance optimization',
        maxChunks: 3,
        minScore: 0.35,
        includeSummary: true,
      });

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: 'article1' },
        select: expect.objectContaining({
          id: true,
          title: true,
          url: true,
          content: true,
          detailedSummary: true,
        }),
      });

      expect(result.chunks).toBeInstanceOf(Array);
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.length).toBeLessThanOrEqual(3);

      // Should include summary chunk
      const summaryChunk = result.chunks.find((c) => c.chunkIndex === -1);
      expect(summaryChunk).toBeDefined();
      expect(summaryChunk?.text).toContain('performance optimization');

      expect(result.metadata).toMatchObject({
        articleId: 'article1',
        title: 'React Performance Tips',
        sourceId: 'source1',
        detailedSummaryUsed: true,
      });

      expect(result.citations).toBeInstanceOf(Array);
      expect(result.citations.length).toBe(result.chunks.length);
    });

    it('should handle article without detailed summary', async () => {
      const mockArticle = {
        id: 'article2',
        title: 'TypeScript Guide',
        url: 'https://example.com/typescript',
        sourceId: 'source2',
        publishedAt: new Date('2025-10-14T09:00:00Z'),
        content: '<p>TypeScript is a typed superset of JavaScript.</p><p>It compiles to plain JavaScript.</p>',
        detailedSummary: null,
      };

      mockFindUnique.mockResolvedValue(mockArticle);

      mockEmbedText.mockResolvedValue(new Array(1536).fill(0.5));

      const result = await articleContextTool.execute({
        articleId: 'article2',
        query: 'TypeScript basics',
        maxChunks: 2,
        minScore: 0.3,
        includeSummary: true,
      });

      expect(result.chunks).toBeInstanceOf(Array);
      expect(result.metadata.detailedSummaryUsed).toBe(false);

      // Should not include summary chunk
      const summaryChunk = result.chunks.find((c) => c.chunkIndex === -1);
      expect(summaryChunk).toBeUndefined();
    });

    it('should handle article with SKIP_DETAILED_SUMMARY marker', async () => {
      const mockArticle = {
        id: 'article3',
        title: 'Short Article',
        url: 'https://example.com/short',
        sourceId: 'source3',
        publishedAt: new Date('2025-10-13T08:00:00Z'),
        content: '<p>Short article content.</p>',
        detailedSummary: '__SKIP_DETAILED_SUMMARY__',
      };

      mockFindUnique.mockResolvedValue(mockArticle);

      mockEmbedText.mockResolvedValue(new Array(1536).fill(0.5));

      const result = await articleContextTool.execute({
        articleId: 'article3',
        query: 'short article',
        maxChunks: 3,
        minScore: 0.35,
        includeSummary: true,
      });

      expect(result.metadata.detailedSummaryUsed).toBe(false);
    });

    it('should return empty chunks when article has no content', async () => {
      const mockArticle = {
        id: 'article4',
        title: 'Empty Article',
        url: 'https://example.com/empty',
        sourceId: 'source4',
        publishedAt: new Date('2025-10-12T07:00:00Z'),
        content: null,
        detailedSummary: null,
      };

      mockFindUnique.mockResolvedValue(mockArticle);

      const result = await articleContextTool.execute({
        articleId: 'article4',
        query: 'test query',
        maxChunks: 3,
        minScore: 0.35,
        includeSummary: true,
      });

      expect(result.chunks).toEqual([]);
      expect(result.citations).toEqual([]);
      expect(result.metadata.totalChunksEvaluated).toBe(0);
    });

    it('should throw error when article not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(
        articleContextTool.execute({
          articleId: 'nonexistent',
          query: 'test query',
          maxChunks: 3,
          minScore: 0.35,
          includeSummary: true,
        })
      ).rejects.toThrow('Article nonexistent not found or content unavailable');
    });

    it('should respect maxChunks limit', async () => {
      const mockArticle = {
        id: 'article5',
        title: 'Long Article',
        url: 'https://example.com/long',
        sourceId: 'source5',
        publishedAt: new Date('2025-10-11T06:00:00Z'),
        content: '<p>Long content paragraph.</p>'.repeat(100), // Very long content
        detailedSummary: '<p>Summary of long article.</p>',
      };

      mockFindUnique.mockResolvedValue(mockArticle);

      mockEmbedText.mockResolvedValue(new Array(1536).fill(0.6));

      const result = await articleContextTool.execute({
        articleId: 'article5',
        query: 'long article test',
        maxChunks: 2,
        minScore: 0.3,
        includeSummary: true,
      });

      expect(result.chunks.length).toBeLessThanOrEqual(2);
    });

    it('should filter chunks below minScore threshold', async () => {
      const mockArticle = {
        id: 'article6',
        title: 'Test Article',
        url: 'https://example.com/test',
        sourceId: 'source6',
        publishedAt: new Date('2025-10-10T05:00:00Z'),
        content: '<p>Some test content here.</p>',
        detailedSummary: '<p>Test summary.</p>',
      };

      mockFindUnique.mockResolvedValue(mockArticle);

      // Mock low similarity scores
      mockEmbedText.mockResolvedValue(new Array(1536).fill(0.2));

      const result = await articleContextTool.execute({
        articleId: 'article6',
        query: 'completely unrelated query xyz',
        maxChunks: 3,
        minScore: 0.5, // High threshold
        includeSummary: true,
      });

      // Should filter out low-scoring chunks
      expect(result.chunks.length).toBeLessThan(3);
    });

    it('should handle sanitization errors gracefully', async () => {
      const mockArticle = {
        id: 'article7',
        title: 'Article with Scripts',
        url: 'https://example.com/scripts',
        sourceId: 'source7',
        publishedAt: new Date('2025-10-09T04:00:00Z'),
        content: '<p>Normal content</p><script>alert("xss")</script><p>More content</p>',
        detailedSummary: '<p>Summary</p>',
      };

      mockFindUnique.mockResolvedValue(mockArticle);

      mockEmbedText.mockResolvedValue(new Array(1536).fill(0.5));

      const result = await articleContextTool.execute({
        articleId: 'article7',
        query: 'test',
        maxChunks: 3,
        minScore: 0.35,
        includeSummary: true,
      });

      // Should sanitize HTML and remove scripts
      const contentChunks = result.chunks.filter((c) => c.chunkIndex >= 0);
      for (const chunk of contentChunks) {
        expect(chunk.html).not.toContain('<script>');
        expect(chunk.text).not.toContain('alert');
      }
    });

    it('should skip includeSummary when set to false', async () => {
      const mockArticle = {
        id: 'article8',
        title: 'Test Article',
        url: 'https://example.com/test8',
        sourceId: 'source8',
        publishedAt: new Date('2025-10-08T03:00:00Z'),
        content: '<p>Test content.</p>',
        detailedSummary: '<p>Summary that should be skipped.</p>',
      };

      mockFindUnique.mockResolvedValue(mockArticle);

      mockEmbedText.mockResolvedValue(new Array(1536).fill(0.5));

      const result = await articleContextTool.execute({
        articleId: 'article8',
        query: 'test',
        maxChunks: 3,
        minScore: 0.35,
        includeSummary: false,
      });

      expect(result.metadata.detailedSummaryUsed).toBe(false);

      // Should not include summary chunk
      const summaryChunk = result.chunks.find((c) => c.chunkIndex === -1);
      expect(summaryChunk).toBeUndefined();
    });
  });
});
