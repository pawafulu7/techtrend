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

  const mockLayer1Results = [
    {
      articleId: 'layer1-1',
      title: 'Layer 1 Article 1',
      summary: 'Summary 1',
      publishedAt: new Date('2023-01-02'),
      qualityScore: 75,
      sourceName: 'Test Source',
      tags: [{ id: 'tag-1', name: 'React' }],
      thumbnail: null,
      similarity: 0.75,
    },
    {
      articleId: 'layer1-2',
      title: 'Layer 1 Article 2',
      summary: 'Summary 2',
      publishedAt: new Date('2023-01-05'),
      qualityScore: 72,
      sourceName: 'Another Source',
      tags: [{ id: 'tag-3', name: 'Vue' }],
      thumbnail: null,
      similarity: 0.6,
    },
  ];

  const mockLayer2Results = [
    {
      articleId: 'layer2-1',
      title: 'Layer 2 Article 1',
      summary: 'Summary 2-1',
      publishedAt: new Date('2023-01-03'),
      qualityScore: 70,
      sourceName: 'Test Source',
      tags: [{ id: 'tag-4', name: 'Svelte' }],
      thumbnail: null,
      similarity: 0.65,
      parentId: 'layer1-1',
    },
    {
      articleId: 'layer2-2',
      title: 'Layer 2 Article 2',
      summary: 'Summary 2-2',
      publishedAt: new Date('2023-01-04'),
      qualityScore: 68,
      sourceName: 'Test Source 2',
      tags: [{ id: 'tag-5', name: 'Next.js' }],
      thumbnail: null,
      similarity: 0.55,
      parentId: 'layer1-2',
    },
  ];

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

      // Verify link values match similarity
      const link1 = graphData.links.find(l => l.target === 'article-1');
      const link2 = graphData.links.find(l => l.target === 'article-2');
      expect(link1?.value).toBe(0.75);
      expect(link2?.value).toBe(0.55);

      // Verify metadata stats
      expect(graphData.metadata.resultStats?.maxSimilarity).toBe(0.75);
      expect(graphData.metadata.resultStats?.minSimilarity).toBe(0.55);
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

  describe('serializeWithDepth (Phase 3)', () => {
    it('should handle depth=1 (backward compatible with serializeEmbeddingBased)', () => {
      const baseline = GraphDataSerializer.serializeEmbeddingBased(
        mockCenterArticle,
        mockLayer1Results
      );

      const graphData = GraphDataSerializer.serializeWithDepth(
        mockCenterArticle,
        mockLayer1Results,
        [],
        'embedding'
      );

      expect(graphData.nodes).toEqual(baseline.nodes);
      expect(graphData.links).toEqual(baseline.links);
      expect(graphData.nodes).toHaveLength(1 + mockLayer1Results.length);
      expect(graphData.links).toHaveLength(mockLayer1Results.length);
      expect(graphData.metadata.options.depth).toBe(1);
      expect(graphData.metadata.options.layer2Limit).toBeUndefined();
      const centerNode = graphData.nodes.find(node => node.id === mockCenterArticle.id);
      expect(centerNode?.depth).toBeUndefined();
      expect(graphData.links.every(link => link.level === undefined)).toBe(true);
      expect(graphData.links.every(link => link.parentId === undefined)).toBe(true);
    });

    it('should handle depth=2 with empty layer2 (graceful degradation)', () => {
      const graphData = GraphDataSerializer.serializeWithDepth(
        mockCenterArticle,
        mockLayer1Results,
        [],
        'tag'
      );

      expect(graphData.metadata.options.depth).toBe(1);
      expect(graphData.metadata.options.layer2Limit).toBeUndefined();
      expect(graphData.nodes).toHaveLength(1 + mockLayer1Results.length);
      expect(graphData.links).toHaveLength(mockLayer1Results.length);
      expect(graphData.metadata.nodeCount).toBe(1 + mockLayer1Results.length);
      expect(graphData.metadata.linkCount).toBe(mockLayer1Results.length);
      expect(graphData.nodes.some(node => node.depth !== undefined)).toBe(false);
      expect(graphData.links.some(link => link.level !== undefined)).toBe(false);
    });

    it('should serialize depth=2 graph with depth/level metadata', () => {
      const graphData = GraphDataSerializer.serializeWithDepth(
        mockCenterArticle,
        mockLayer1Results,
        mockLayer2Results,
        'tag'
      );

      expect(graphData.metadata.options.depth).toBe(2);
      expect(graphData.metadata.options.layer2Limit).toBe(mockLayer2Results.length);
      expect(graphData.metadata.options.layer2PerParent).toBe(1);
      expect(graphData.nodes).toHaveLength(
        1 + mockLayer1Results.length + mockLayer2Results.length
      );
      expect(graphData.links).toHaveLength(
        mockLayer1Results.length + mockLayer2Results.length
      );

      const centerNode = graphData.nodes.find(node => node.id === mockCenterArticle.id);
      const layer1Node = graphData.nodes.find(node => node.id === mockLayer1Results[0].articleId);
      const layer2Node = graphData.nodes.find(node => node.id === mockLayer2Results[0].articleId);
      expect(centerNode?.depth).toBe(0);
      expect(layer1Node?.depth).toBe(1);
      expect(layer2Node?.depth).toBe(2);

      const layer1Link = graphData.links.find(link => link.target === mockLayer1Results[0].articleId);
      const layer2Link = graphData.links.find(link => link.target === mockLayer2Results[0].articleId);
      expect(layer1Link?.level).toBe(1);
      expect(layer1Link?.parentId).toBeUndefined();
      expect(layer2Link?.level).toBe(2);
      expect(layer2Link?.parentId).toBe(mockLayer2Results[0].parentId);
    });
  });

  describe('selectTopLayer2 (Phase 3)', () => {
    it('should exclude duplicates (center and layer1)', () => {
      const candidates = [
        {
          articleId: mockCenterArticle.id,
          title: 'Duplicate Center',
          summary: 'Should be excluded',
          publishedAt: new Date('2023-01-06'),
          qualityScore: 70,
          sourceName: 'Dup Source',
          tags: [],
          thumbnail: null,
          similarity: 0.8,
          parentId: mockLayer1Results[0].articleId,
        },
        {
          articleId: mockLayer1Results[0].articleId,
          title: 'Duplicate Layer1',
          summary: 'Should be excluded',
          publishedAt: new Date('2023-01-06'),
          qualityScore: 70,
          sourceName: 'Dup Source',
          tags: [],
          thumbnail: null,
          similarity: 0.7,
          parentId: mockLayer1Results[0].articleId,
        },
        {
          articleId: 'layer2-duplicate',
          title: 'Layer2 Duplicate Low',
          summary: 'Lower similarity',
          publishedAt: new Date('2023-01-07'),
          qualityScore: 65,
          sourceName: 'Dup Source',
          tags: [],
          thumbnail: null,
          similarity: 0.4,
          parentId: mockLayer1Results[0].articleId,
        },
        {
          articleId: 'layer2-duplicate',
          title: 'Layer2 Duplicate High',
          summary: 'Higher similarity',
          publishedAt: new Date('2023-01-08'),
          qualityScore: 75,
          sourceName: 'Dup Source',
          tags: [],
          thumbnail: null,
          similarity: 0.9,
          parentId: mockLayer1Results[1].articleId,
        },
        {
          articleId: 'layer2-valid',
          title: 'Layer2 Valid',
          summary: 'Unique candidate',
          publishedAt: new Date('2023-01-09'),
          qualityScore: 72,
          sourceName: 'Dup Source',
          tags: [],
          thumbnail: null,
          similarity: 0.6,
          parentId: mockLayer1Results[1].articleId,
        },
      ];

      const selected = GraphDataSerializer.selectTopLayer2(
        candidates,
        mockLayer1Results,
        mockCenterArticle,
        3
      );

      expect(selected).toHaveLength(2);
      expect(selected.map(candidate => candidate.articleId)).toEqual([
        'layer2-duplicate',
        'layer2-valid',
      ]);
      const deduped = selected.find(candidate => candidate.articleId === 'layer2-duplicate');
      expect(deduped?.parentId).toBe(mockLayer1Results[1].articleId);
      expect(selected.some(candidate => candidate.articleId === mockCenterArticle.id)).toBe(false);
      expect(
        selected.some(candidate => candidate.articleId === mockLayer1Results[0].articleId)
      ).toBe(false);
    });

    it('should prioritize by parent similarity', () => {
      const singleLayer1 = [
        {
          articleId: 'layer1-single',
          title: 'Layer 1 Solo',
          summary: 'Solo parent',
          publishedAt: new Date('2023-01-02'),
          qualityScore: 75,
          sourceName: 'Solo Source',
          tags: [{ id: 'tag-6', name: 'Node' }],
          thumbnail: null,
          similarity: 0.9,
        },
      ];

      const candidates = [
        {
          articleId: 'layer2-low',
          title: 'Layer2 Low',
          summary: 'Low sim',
          publishedAt: new Date('2023-01-10'),
          qualityScore: 60,
          sourceName: 'Solo Source',
          tags: [],
          thumbnail: null,
          similarity: 0.4,
          parentId: 'layer1-single',
        },
        {
          articleId: 'layer2-mid',
          title: 'Layer2 Mid',
          summary: 'Mid sim',
          publishedAt: new Date('2023-01-11'),
          qualityScore: 65,
          sourceName: 'Solo Source',
          tags: [],
          thumbnail: null,
          similarity: 0.6,
          parentId: 'layer1-single',
        },
        {
          articleId: 'layer2-high',
          title: 'Layer2 High',
          summary: 'High sim',
          publishedAt: new Date('2023-01-12'),
          qualityScore: 80,
          sourceName: 'Solo Source',
          tags: [],
          thumbnail: null,
          similarity: 0.85,
          parentId: 'layer1-single',
        },
      ];

      const selected = GraphDataSerializer.selectTopLayer2(
        candidates,
        singleLayer1,
        mockCenterArticle,
        2
      );

      expect(selected.map(candidate => candidate.articleId)).toEqual([
        'layer2-high',
        'layer2-mid',
      ]);
    });

    it('should apply round-robin cap per parent', () => {
      const layer1ForCap = [
        {
          articleId: 'layer1-a',
          title: 'Layer 1 A',
          summary: 'Parent A',
          publishedAt: new Date('2023-01-02'),
          qualityScore: 80,
          sourceName: 'Source A',
          tags: [],
          thumbnail: null,
          similarity: 0.95,
        },
        {
          articleId: 'layer1-b',
          title: 'Layer 1 B',
          summary: 'Parent B',
          publishedAt: new Date('2023-01-02'),
          qualityScore: 70,
          sourceName: 'Source B',
          tags: [],
          thumbnail: null,
          similarity: 0.5,
        },
      ];

      const candidates = [
        {
          articleId: 'layer2-a1',
          title: 'Layer2 A1',
          summary: 'A candidate 1',
          publishedAt: new Date('2023-01-15'),
          qualityScore: 85,
          sourceName: 'Source A',
          tags: [],
          thumbnail: null,
          similarity: 0.9,
          parentId: 'layer1-a',
        },
        {
          articleId: 'layer2-a2',
          title: 'Layer2 A2',
          summary: 'A candidate 2',
          publishedAt: new Date('2023-01-14'),
          qualityScore: 84,
          sourceName: 'Source A',
          tags: [],
          thumbnail: null,
          similarity: 0.9,
          parentId: 'layer1-a',
        },
        {
          articleId: 'layer2-a3',
          title: 'Layer2 A3',
          summary: 'A candidate 3',
          publishedAt: new Date('2023-01-13'),
          qualityScore: 83,
          sourceName: 'Source A',
          tags: [],
          thumbnail: null,
          similarity: 0.9,
          parentId: 'layer1-a',
        },
        {
          articleId: 'layer2-b1',
          title: 'Layer2 B1',
          summary: 'B candidate 1',
          publishedAt: new Date('2023-01-10'),
          qualityScore: 60,
          sourceName: 'Source B',
          tags: [],
          thumbnail: null,
          similarity: 0.4,
          parentId: 'layer1-b',
        },
      ];

      const selected = GraphDataSerializer.selectTopLayer2(
        candidates,
        layer1ForCap,
        mockCenterArticle,
        3
      );

      expect(selected.map(candidate => candidate.articleId)).toEqual([
        'layer2-a1',
        'layer2-a2',
        'layer2-b1',
      ]);
      const countsByParent = selected.reduce<Record<string, number>>((acc, candidate) => {
        acc[candidate.parentId] = (acc[candidate.parentId] || 0) + 1;
        return acc;
      }, {});
      expect(countsByParent['layer1-a']).toBe(2);  // perParentCap = ceil(3 / 2)
      expect(countsByParent['layer1-b']).toBe(1);
    });
  });
});
