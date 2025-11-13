import { GraphDataSerializer } from '@/lib/graph/graph-data-serializer';
import type { Article } from '@prisma/client';

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('GraphDataSerializer', () => {
  const mockCenterArticle: Article & { tags: Array<{ id: string; name: string }> } = {
    id: 'center-1',
    title: 'Center Article',
    url: 'https://example.com/center',
    summary: 'Center summary',
    translatedTitle: null,
    publishedAt: new Date('2023-01-01'),
    sourceId: 'source-1',
    category: null,
    qualityScore: 80,
    tags: [
      { id: 'tag-1', name: 'React' },
      { id: 'tag-2', name: 'TypeScript' },
    ],
    bookmarks: 0,
    userVotes: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    thumbnail: null,
    content: null,
    contentUpdatedAt: null,
    summaryComputedAt: null,
    difficulty: null,
    qualityScoreComputedAt: null,
  };

  describe('serializeEmbeddingBased', () => {
    it('should serialize embedding results to GraphData', () => {
      const mockResults = [
        {
          articleId: 'article-1',
          title: 'Related Article 1',
          summary: 'Summary 1',
          publishedAt: new Date('2023-01-02'),
          qualityScore: 75,
          sourceName: 'Test Source',
          tags: [{ id: 'tag-1', name: 'React' }],
          thumbnail: null,
          similarity: 0.75,
        },
        {
          articleId: 'article-2',
          title: 'Related Article 2',
          summary: null,
          publishedAt: new Date('2023-01-03'),
          qualityScore: 60,
          sourceName: 'Test Source 2',
          tags: [{ id: 'tag-3', name: 'Vue' }],
          thumbnail: 'https://example.com/thumb.jpg',
          similarity: 0.55,
        },
      ];

      const graphData = GraphDataSerializer.serializeEmbeddingBased(
        mockCenterArticle,
        mockResults
      );

      expect(graphData.nodes).toHaveLength(3);  // 1 center + 2 related
      expect(graphData.links).toHaveLength(2);
      expect(graphData.metadata.algorithm).toBe('embedding');
      expect(graphData.metadata.centerArticleId).toBe('center-1');
    });

    it('should handle empty embedding results', () => {
      const graphData = GraphDataSerializer.serializeEmbeddingBased(
        mockCenterArticle,
        []
      );

      expect(graphData.nodes).toHaveLength(1);  // Only center
      expect(graphData.links).toHaveLength(0);
      expect(graphData.metadata.nodeCount).toBe(1);
    });

    it('should apply similarity-based color adjustment', () => {
      const mockResults = [
        {
          articleId: 'article-1',
          title: 'High Similarity',
          summary: 'Summary',
          publishedAt: new Date(),
          qualityScore: 70,
          sourceName: 'Source',
          tags: [{ id: 'tag-1', name: 'React' }],
          thumbnail: null,
          similarity: 0.8,  // High
        },
        {
          articleId: 'article-2',
          title: 'Low Similarity',
          summary: 'Summary',
          publishedAt: new Date(),
          qualityScore: 70,
          sourceName: 'Source',
          tags: [{ id: 'tag-2', name: 'Vue' }],
          thumbnail: null,
          similarity: 0.5,  // Low
        },
      ];

      const graphData = GraphDataSerializer.serializeEmbeddingBased(
        mockCenterArticle,
        mockResults
      );

      const node1 = graphData.nodes.find(n => n.id === 'article-1');
      const node2 = graphData.nodes.find(n => n.id === 'article-2');

      // High similarity should have brighter color
      expect(node1?.color).not.toBe(node2?.color);
    });

    it('should apply hybrid node size (quality × similarity)', () => {
      const mockResults = [
        {
          articleId: 'article-1',
          title: 'Test',
          summary: 'Summary',
          publishedAt: new Date(),
          qualityScore: 80,
          sourceName: 'Source',
          tags: [],
          thumbnail: null,
          similarity: 0.7,
        },
      ];

      const graphData = GraphDataSerializer.serializeEmbeddingBased(
        mockCenterArticle,
        mockResults
      );

      const relatedNode = graphData.nodes.find(n => n.id === 'article-1');

      // val should be clamped between 30-140
      expect(relatedNode?.val).toBeGreaterThanOrEqual(30);
      expect(relatedNode?.val).toBeLessThanOrEqual(140);
    });
  });
});
