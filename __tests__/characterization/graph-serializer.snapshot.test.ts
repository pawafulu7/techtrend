/**
 * GraphDataSerializer Characterization Tests (Snapshot)
 *
 * Purpose: Capture current behavior to detect unintended changes during refactoring.
 * These tests use snapshots to record the current graph serialization behavior.
 *
 * @see lib/graph/graph-data-serializer.ts
 */

import { GraphDataSerializer } from '../../lib/graph/graph-data-serializer';
import { Article } from '@prisma/client';

// Mock logger to avoid console output during tests and detect unexpected errors
jest.mock('../../lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Get reference to mocked logger for assertions
import { logger as mockLogger } from '../../lib/logger';

// Helper to sanitize timestamps for stable snapshots
const sanitizeResult = <T extends { metadata?: { timestamp?: string } }>(result: T): T => {
  if (result.metadata?.timestamp) {
    return {
      ...result,
      metadata: {
        ...result.metadata,
        timestamp: 'FIXED_TIMESTAMP',
      },
    };
  }
  return result;
};

describe('GraphDataSerializer Characterization Tests', () => {
  // Verify no unexpected errors or warnings after each test
  afterEach(() => {
    expect(mockLogger.error).not.toHaveBeenCalled();
    // Reset mocks for next test
    jest.clearAllMocks();
  });

  // Test data factory
  const createMockArticle = (overrides: Partial<Article> = {}): Article => ({
    id: 'article-1',
    title: 'Test Article Title',
    translatedTitle: null,
    url: 'https://example.com/article-1',
    summary: 'This is a test article summary for characterization testing.',
    detailSummary: null,
    content: 'Full content of the article.',
    thumbnail: 'https://example.com/thumb.jpg',
    publishedAt: new Date('2024-01-15T10:00:00Z'),
    fetchedAt: new Date('2024-01-15T12:00:00Z'),
    sourceId: 'source-1',
    qualityScore: 7,
    embeddingGeneratedAt: null,
    summaryGeneratedAt: new Date('2024-01-15T12:00:00Z'),
    author: 'Test Author',
    language: 'ja',
    isTranslation: false,
    translationSource: null,
    createdAt: new Date('2024-01-15T12:00:00Z'),
    updatedAt: new Date('2024-01-15T12:00:00Z'),
    ...overrides,
  });

  const createMockArticleWithTags = (
    id: string,
    tags: string[],
    qualityScore = 5,
    similarity?: number
  ) => ({
    ...createMockArticle({ id, qualityScore }),
    tags: tags.map((name, idx) => ({ id: `tag-${idx}`, name })),
    similarity,
  });

  describe('serializeTagBased - tag-based relationship serialization', () => {
    it('serializes center article with no related articles', () => {
      const center = createMockArticleWithTags('center-1', ['React', 'TypeScript']);
      const result = GraphDataSerializer.serializeTagBased(
        center as unknown as Article & { tags: Array<{ id: string; name: string }> },
        []
      );
      expect(sanitizeResult(result)).toMatchSnapshot('no-related-articles');
    });

    it('serializes center article with related articles', () => {
      const center = createMockArticleWithTags('center-1', ['React', 'TypeScript', 'Frontend']);
      const related = [
        { ...createMockArticleWithTags('related-1', ['React', 'JavaScript']), similarity: 0.85, commonTags: 2 },
        { ...createMockArticleWithTags('related-2', ['TypeScript', 'Node.js']), similarity: 0.72, commonTags: 1 },
        { ...createMockArticleWithTags('related-3', ['Frontend', 'CSS']), similarity: 0.65, commonTags: 1 },
      ];
      const result = GraphDataSerializer.serializeTagBased(
        center as unknown as Article & { tags: Array<{ id: string; name: string }> },
        related as any
      );
      expect(sanitizeResult(result)).toMatchSnapshot('with-related-articles');
    });

    it('handles articles with varying quality scores', () => {
      const center = createMockArticleWithTags('center-1', ['AI', 'ML'], 9);
      const related = [
        { ...createMockArticleWithTags('related-1', ['AI'], 8), similarity: 0.9, commonTags: 1 },
        { ...createMockArticleWithTags('related-2', ['ML'], 3), similarity: 0.5, commonTags: 1 },
        { ...createMockArticleWithTags('related-3', ['AI'], 10), similarity: 0.95, commonTags: 1 },
      ];
      const result = GraphDataSerializer.serializeTagBased(
        center as unknown as Article & { tags: Array<{ id: string; name: string }> },
        related as any
      );
      expect(sanitizeResult(result)).toMatchSnapshot('varying-quality-scores');
    });
  });

  describe('serializeEmbeddingBased - embedding-based relationship serialization', () => {
    it('serializes embedding-based results', () => {
      const center = createMockArticleWithTags('center-1', ['GPT', 'LLM', 'AI']);
      const searchResults = [
        { article: createMockArticleWithTags('embed-1', ['GPT', 'OpenAI']), similarity: 0.92 },
        { article: createMockArticleWithTags('embed-2', ['LLM', 'Claude']), similarity: 0.88 },
        { article: createMockArticleWithTags('embed-3', ['AI', 'Gemini']), similarity: 0.75 },
      ];
      const result = GraphDataSerializer.serializeEmbeddingBased(
        center as unknown as Article & { tags: Array<{ id: string; name: string }> },
        searchResults as any
      );
      expect(sanitizeResult(result)).toMatchSnapshot('embedding-based-results');
    });

    it('handles empty search results', () => {
      const center = createMockArticleWithTags('center-1', ['Docker', 'Kubernetes']);
      const result = GraphDataSerializer.serializeEmbeddingBased(
        center as unknown as Article & { tags: Array<{ id: string; name: string }> },
        []
      );
      expect(sanitizeResult(result)).toMatchSnapshot('empty-search-results');
    });
  });

  describe('serializeWithDepth - depth-based relationship serialization', () => {
    it('serializes with depth=1', () => {
      const centerArticle = {
        ...createMockArticle({ id: 'depth-center' }),
        tags: [{ id: 'tag-1', name: 'React' }, { id: 'tag-2', name: 'TypeScript' }],
      };

      const layer1Articles = [
        {
          ...createMockArticle({ id: 'layer1-1' }),
          tags: [{ id: 'tag-1', name: 'React' }],
        },
        {
          ...createMockArticle({ id: 'layer1-2' }),
          tags: [{ id: 'tag-2', name: 'TypeScript' }],
        },
      ];

      const result = GraphDataSerializer.serializeWithDepth(
        centerArticle as any,
        layer1Articles as any,
        [],
        { mode: 'tag', depth: 1, maxLayer1: 10, maxLayer2PerNode: 5 }
      );
      expect(sanitizeResult(result)).toMatchSnapshot('depth-1-serialization');
    });

    it('serializes with depth=2', () => {
      const centerArticle = {
        ...createMockArticle({ id: 'depth-center' }),
        tags: [{ id: 'tag-1', name: 'AWS' }],
      };

      const layer1Articles = [
        {
          ...createMockArticle({ id: 'layer1-1', qualityScore: 8 }),
          tags: [{ id: 'tag-1', name: 'AWS' }, { id: 'tag-2', name: 'Lambda' }],
        },
      ];

      const layer2Articles = [
        {
          ...createMockArticle({ id: 'layer2-1', qualityScore: 6 }),
          tags: [{ id: 'tag-2', name: 'Lambda' }, { id: 'tag-3', name: 'Serverless' }],
          relatedToIds: ['layer1-1'],
        },
      ];

      const result = GraphDataSerializer.serializeWithDepth(
        centerArticle as any,
        layer1Articles as any,
        layer2Articles as any,
        { mode: 'tag', depth: 2, maxLayer1: 10, maxLayer2PerNode: 5 }
      );
      expect(sanitizeResult(result)).toMatchSnapshot('depth-2-serialization');
    });
  });

  describe('selectTopLayer2 - layer 2 article selection', () => {
    it('selects top layer2 articles with category diversity', () => {
      const layer1Ids = ['l1-1', 'l1-2'];
      const layer2Candidates = [
        {
          ...createMockArticle({ id: 'l2-1', qualityScore: 9 }),
          tags: [{ id: 't1', name: 'React' }],
          relatedToIds: ['l1-1'],
        },
        {
          ...createMockArticle({ id: 'l2-2', qualityScore: 8 }),
          tags: [{ id: 't2', name: 'Vue' }],
          relatedToIds: ['l1-1'],
        },
        {
          ...createMockArticle({ id: 'l2-3', qualityScore: 7 }),
          tags: [{ id: 't3', name: 'AWS' }],
          relatedToIds: ['l1-2'],
        },
        {
          ...createMockArticle({ id: 'l2-4', qualityScore: 6 }),
          tags: [{ id: 't4', name: 'Docker' }],
          relatedToIds: ['l1-2'],
        },
      ];

      const result = GraphDataSerializer.selectTopLayer2(
        layer1Ids,
        layer2Candidates as any,
        { maxLayer2PerNode: 2 }
      );
      expect(result).toMatchSnapshot('top-layer2-selection');
    });

    it('handles empty candidates', () => {
      const result = GraphDataSerializer.selectTopLayer2(
        ['l1-1'],
        [],
        { maxLayer2PerNode: 5 }
      );
      expect(result).toMatchSnapshot('empty-layer2-candidates');
    });
  });

  describe('node properties - size and color calculations', () => {
    // These tests verify the node property calculations are consistent
    const testArticles = [
      { qualityScore: 10, similarity: 1.0, description: 'max quality, max similarity' },
      { qualityScore: 5, similarity: 0.5, description: 'mid quality, mid similarity' },
      { qualityScore: 1, similarity: 0.1, description: 'low quality, low similarity' },
      { qualityScore: 0, similarity: 0, description: 'zero quality, zero similarity' },
    ];

    it.each(testArticles)(
      'calculates node properties for $description',
      ({ qualityScore, similarity }) => {
        const center = createMockArticleWithTags('center', ['Test'], qualityScore);
        const related = [
          { ...createMockArticleWithTags('related', ['Test'], qualityScore), similarity, commonTags: 1 },
        ];
        const result = GraphDataSerializer.serializeTagBased(
          center as unknown as Article & { tags: Array<{ id: string; name: string }> },
          related as any
        );
        // Extract node properties for snapshot
        const nodeProps = result.nodes.map(n => ({
          id: n.id,
          size: n.size,
          color: n.color,
        }));
        expect(nodeProps).toMatchSnapshot();
      }
    );
  });

  describe('category detection - tag to category mapping', () => {
    const categoryTestCases = [
      { tags: ['React', 'Vue', 'Angular'], expected: 'Frontend' },
      { tags: ['AI', 'ML', 'LLM'], expected: 'AI/ML' },
      { tags: ['Node.js', 'Express', 'API'], expected: 'Backend' },
      { tags: ['Docker', 'Kubernetes', 'CI/CD'], expected: 'DevOps' },
      { tags: ['PostgreSQL', 'MongoDB', 'Redis'], expected: 'Database' },
      { tags: ['Security', 'OAuth', 'JWT'], expected: 'Security' },
      { tags: ['Jest', 'Playwright', 'E2E'], expected: 'Testing' },
      { tags: ['UnknownTag1', 'UnknownTag2'], expected: 'Other or undefined' },
    ];

    it.each(categoryTestCases)(
      'detects category for tags: $tags',
      ({ tags }) => {
        const article = createMockArticleWithTags('cat-test', tags);
        const result = GraphDataSerializer.serializeTagBased(
          article as unknown as Article & { tags: Array<{ id: string; name: string }> },
          []
        );
        const centerNode = result.nodes.find(n => n.isCenter);
        expect({ tags, category: centerNode?.category }).toMatchSnapshot();
      }
    );
  });
});
