/**
 * /api/articles/[id]/relationship-graph depth=2 integration tests
 */

jest.mock('@/lib/prisma');

const searchByArticleIdMock = jest.fn();

jest.mock('@/lib/rag/vector-search-service', () => ({
  VectorSearchService: jest.fn().mockImplementation(() => ({
    searchByArticleId: searchByArticleIdMock,
  })),
}));

jest.mock('@/lib/cache/article-detail-cache', () => ({
  articleDetailCache: {
    getArticleWithRelations: jest.fn(),
    getRelatedArticles: jest.fn(),
  },
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/articles/[id]/relationship-graph/route';
import { articleDetailCache } from '@/lib/cache/article-detail-cache';
import type { SearchResult } from '@/lib/rag/vector-search-service';

type ArticleCache = jest.Mocked<typeof articleDetailCache>;

describe('GET /api/articles/[id]/relationship-graph - Depth 2', () => {
  const mockedArticleDetailCache = articleDetailCache as ArticleCache;
  const centerArticleId = 'article-center';
  const mockCenterArticle: any = {
    id: centerArticleId,
    title: 'Center Article',
    url: 'https://example.com/articles/center',
    summary: 'Center summary',
    qualityScore: 92,
    thumbnail: null,
    content: 'Center content',
    detailedSummary: 'Detailed center summary',
    publishedAt: new Date('2025-01-01T00:00:00Z'),
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    sourceId: 'source-1',
    bookmarks: 0,
    userVotes: 0,
    articleType: 'unified',
    summaryVersion: 7,
    difficulty: 'intermediate',
    source: {
      id: 'source-1',
      name: 'Dev.to',
      type: 'API',
      url: 'https://dev.to',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    tags: [
      { id: 'tag-ts', name: 'TypeScript' },
      { id: 'tag-react', name: 'React' },
    ],
  };

  const layer1Results: SearchResult[] = [
    {
      articleId: 'article-layer1-a',
      title: 'Layer 1 - A',
      summary: 'L1 summary A',
      translatedTitle: null,
      similarity: 0.82,
      publishedAt: new Date('2025-01-02T00:00:00Z'),
      sourceId: 'source-2',
      sourceName: 'InfoQ',
      embeddingKey: 'summary',
      qualityScore: 74,
      tags: [{ id: 'tag-ts', name: 'TypeScript' }],
      thumbnail: null,
    },
    {
      articleId: 'article-layer1-b',
      title: 'Layer 1 - B',
      summary: 'L1 summary B',
      translatedTitle: null,
      similarity: 0.65,
      publishedAt: new Date('2025-01-03T00:00:00Z'),
      sourceId: 'source-3',
      sourceName: 'Zenn',
      embeddingKey: 'summary',
      qualityScore: 68,
      tags: [{ id: 'tag-react', name: 'React' }],
      thumbnail: null,
    },
  ];

  const layer2Children: Record<string, SearchResult[]> = {
    'article-layer1-a': [
      {
        articleId: 'article-layer2-a1',
        title: 'Layer 2 - A1',
        summary: 'L2 summary A1',
        translatedTitle: null,
        similarity: 0.58,
        publishedAt: new Date('2025-01-04T00:00:00Z'),
        sourceId: 'source-4',
        sourceName: 'Qiita',
        embeddingKey: 'summary',
        qualityScore: 66,
        tags: [{ id: 'tag-node', name: 'Node.js' }],
        thumbnail: null,
      },
    ],
    'article-layer1-b': [
      {
        articleId: 'article-layer2-b1',
        title: 'Layer 2 - B1',
        summary: 'L2 summary B1',
        translatedTitle: null,
        similarity: 0.55,
        publishedAt: new Date('2025-01-05T00:00:00Z'),
        sourceId: 'source-5',
        sourceName: 'Hatena',
        embeddingKey: 'summary',
        qualityScore: 63,
        tags: [{ id: 'tag-next', name: 'Next.js' }],
        thumbnail: null,
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    searchByArticleIdMock.mockReset();

    mockedArticleDetailCache.getArticleWithRelations.mockResolvedValue(mockCenterArticle);
  });

  function createRequest(search = '') {
    const url = `http://localhost:3000/api/articles/${centerArticleId}/relationship-graph${search}`;
    return new NextRequest(url);
  }

  test('should return depth=1 graph by default', async () => {
    searchByArticleIdMock.mockResolvedValueOnce(layer1Results);

    const request = createRequest('?algorithm=embedding');
    const response = await GET(request, { params: Promise.resolve({ id: centerArticleId }) });
    const graph = await response.json();

    expect(response.status).toBe(200);
    expect(graph.metadata.options.depth).toBe(1);
    expect(graph.nodes[0].depth).toBeUndefined();
    expect(graph.links[0].level).toBeUndefined();
    expect(graph.nodes).toHaveLength(layer1Results.length + 1);
    expect(searchByArticleIdMock).toHaveBeenCalledTimes(1);
  });

  test('should return depth=2 graph with layer metadata', async () => {
    searchByArticleIdMock.mockImplementation(async (articleId: string) => {
      if (articleId === centerArticleId) {
        return layer1Results;
      }
      return layer2Children[articleId] || [];
    });

    const request = createRequest('?algorithm=embedding&depth=2');
    const response = await GET(request, { params: Promise.resolve({ id: centerArticleId }) });
    const graph = await response.json();

    expect(response.status).toBe(200);
    expect(graph.metadata.options.depth).toBe(2);

    const centerNode = graph.nodes.find((node: any) => node.id === centerArticleId);
    const layer1Node = graph.nodes.find((node: any) => node.id === layer1Results[0].articleId);
    const layer2Node = graph.nodes.find((node: any) => node.id === layer2Children[layer1Results[0].articleId][0].articleId);

    expect(centerNode.depth).toBe(0);
    expect(layer1Node.depth).toBe(1);
    expect(layer2Node.depth).toBe(2);

    const level1Link = graph.links.find((link: any) => link.target === layer1Results[0].articleId);
    const level2Link = graph.links.find((link: any) => link.target === layer2Children[layer1Results[0].articleId][0].articleId);

    expect(level1Link.level).toBe(1);
    expect(level2Link.level).toBe(2);
    expect(level2Link.parentId).toBe(layer1Results[0].articleId);
  });

  test('should handle graceful degradation when layer1 is empty', async () => {
    searchByArticleIdMock.mockResolvedValueOnce([]);

    const request = createRequest('?algorithm=embedding&depth=2');
    const response = await GET(request, { params: Promise.resolve({ id: centerArticleId }) });
    const graph = await response.json();

    expect(response.status).toBe(200);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.links).toHaveLength(0);
    expect(graph.metadata.nodeCount).toBe(1);
    expect(graph.metadata.options.depth).toBe(2);
  });
});
