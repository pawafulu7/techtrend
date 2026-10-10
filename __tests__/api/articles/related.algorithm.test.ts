jest.mock('@/lib/prisma');

const vectorSearchServiceMock = {
  isEmbeddingServiceAvailable: jest.fn(),
  searchByArticleId: jest.fn(),
};

jest.mock('@/lib/rag/vector-search-service', () => {
  const actual = jest.requireActual('@/lib/rag/vector-search-service');
  return {
    ...actual,
    VectorSearchService: jest.fn(() => vectorSearchServiceMock),
  };
});

jest.mock('@/lib/cache/article-detail-cache', () => ({
  articleDetailCache: {
    getArticleWithRelations: jest.fn(),
    getRelatedArticles: jest.fn(),
    getEmbeddingRelatedArticles: jest.fn(),
  },
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/articles/[id]/related/route';
import { articleDetailCache } from '@/lib/cache/article-detail-cache';
import type { SearchResult } from '@/lib/rag/vector-search-service';

type ArticleCacheMock = jest.Mocked<typeof articleDetailCache>;
type VectorSearchMock = typeof vectorSearchServiceMock;

describe('GET /api/articles/[id]/related - algorithm switching', () => {
  const mockedArticleCache = articleDetailCache as ArticleCacheMock;
  const mockedVectorSearch = vectorSearchServiceMock as VectorSearchMock;
  const articleId = 'article-123';
  const baseArticle = {
    id: articleId,
    title: 'Primary Article',
    summary: 'Base summary',
    url: '/articles/article-123',
    sourceName: 'TechTrend',
    publishedAt: new Date('2025-01-01T00:00:00Z'),
    qualityScore: 95,
    difficulty: 'intermediate',
    tags: [
      { id: 'tag-react', name: 'React' },
      { id: 'tag-node', name: 'Node.js' },
    ],
  } as const;

  const tagBasedResult = {
    id: 'related-tag-1',
    title: 'Tag Related Article',
    translatedTitle: 'タグ関連記事',
    summary: 'Tag summary',
    url: '/articles/related-tag-1',
    sourceName: 'Dev.to',
    publishedAt: new Date('2025-01-02T00:00:00Z'),
    qualityScore: 80,
    difficulty: 'beginner',
    commonTags: 2,
    tags: 'tag-react::React||tag-node::Node.js',
  } as const;

  const createRequest = (search = '') =>
    new NextRequest(`http://localhost/api/articles/${articleId}/related${search}`);

  beforeEach(() => {
    jest.clearAllMocks();
    mockedArticleCache.getArticleWithRelations.mockResolvedValue(baseArticle as any);
    mockedArticleCache.getRelatedArticles.mockResolvedValue([tagBasedResult]);
    mockedVectorSearch.isEmbeddingServiceAvailable.mockReturnValue(true);
    mockedVectorSearch.searchByArticleId.mockResolvedValue([]);
    // 実物と同じく、キャッシュに無ければ渡した関数で検索する（ここではいつも外れる）
    mockedArticleCache.getEmbeddingRelatedArticles.mockImplementation(
      (_articleId, _limit, fetcher) => fetcher()
    );
  });

  test('returns tag-based results when algorithm=tag', async () => {
    const response = await GET(createRequest('?algorithm=tag'), {
      params: Promise.resolve({ id: articleId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.metadata.algorithm).toBe('tag');
    expect(body.articles).toHaveLength(1);
    expect(body.articles[0].id).toBe(tagBasedResult.id);
    expect(body.articles[0].translatedTitle).toBe('タグ関連記事');
    expect(mockedArticleCache.getRelatedArticles).toHaveBeenCalledWith(articleId, [
      'tag-react',
      'tag-node',
    ]);
    expect(mockedVectorSearch.searchByArticleId).not.toHaveBeenCalled();
  });

  test('returns embedding results when algorithm=embedding', async () => {
    const embeddingResults: SearchResult[] = [
      {
        articleId: 'embedding-1',
        title: 'Embedding Article 1',
        summary: 'Embedding summary',
        translatedTitle: null,
        similarity: 0.78,
        publishedAt: new Date('2025-01-03T00:00:00Z'),
        sourceId: 'source-1',
        sourceName: 'Vector Source',
        embeddingKey: 'summary',
        qualityScore: 72,
        tags: [{ id: 'tag-react', name: 'React' }],
        thumbnail: null,
      },
    ];

    mockedVectorSearch.searchByArticleId.mockResolvedValueOnce(embeddingResults);

    const response = await GET(createRequest('?algorithm=embedding'), {
      params: Promise.resolve({ id: articleId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.metadata.algorithm).toBe('embedding');
    expect(body.articles).toHaveLength(1);
    expect(body.articles[0].id).toBe('embedding-1');
    expect(body.articles[0].translatedTitle).toBeNull();
    expect(mockedArticleCache.getRelatedArticles).not.toHaveBeenCalled();
  });

  test('returns embedding results when algorithm=auto and embedding succeeds', async () => {
    const embeddingResults: SearchResult[] = [
      {
        articleId: 'embedding-auto',
        title: 'Embedding Auto',
        summary: 'Auto summary',
        translatedTitle: null,
        similarity: 0.82,
        publishedAt: new Date('2025-01-04T00:00:00Z'),
        sourceId: 'source-2',
        sourceName: 'Auto Source',
        embeddingKey: 'summary',
        qualityScore: 88,
        tags: [{ id: 'tag-node', name: 'Node.js' }],
        thumbnail: null,
      },
    ];

    mockedVectorSearch.searchByArticleId.mockResolvedValueOnce(embeddingResults);

    const response = await GET(createRequest('?algorithm=auto'), {
      params: Promise.resolve({ id: articleId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.metadata.algorithm).toBe('embedding');
    expect(body.metadata.source).toBeUndefined();
    expect(body.articles[0].id).toBe('embedding-auto');
    expect(mockedArticleCache.getRelatedArticles).not.toHaveBeenCalled();
    expect(mockedArticleCache.getEmbeddingRelatedArticles).toHaveBeenCalledWith(
      articleId,
      20,
      expect.any(Function)
    );
    expect(mockedVectorSearch.searchByArticleId).toHaveBeenCalledWith(articleId, {
      topK: 20,
      similarityThreshold: 0.5,
    });
  });

  test('limit をキャッシュのキーと検索の件数に渡す', async () => {
    await GET(createRequest('?limit=5'), {
      params: Promise.resolve({ id: articleId }),
    });

    expect(mockedArticleCache.getEmbeddingRelatedArticles).toHaveBeenCalledWith(
      articleId,
      5,
      expect.any(Function)
    );
    expect(mockedVectorSearch.searchByArticleId).toHaveBeenCalledWith(articleId, {
      topK: 5,
      similarityThreshold: 0.5,
    });
  });

  test('埋め込みの関連記事が Redis にあれば、埋め込み検索をしない', async () => {
    const cachedResults: SearchResult[] = [
      {
        articleId: 'embedding-cached',
        title: 'Cached',
        summary: 'Cached summary',
        translatedTitle: null,
        similarity: 0.8,
        publishedAt: new Date('2025-01-06T00:00:00Z'),
        sourceId: 'source-4',
        sourceName: 'Cached Source',
        embeddingKey: 'summary',
        qualityScore: 70,
        tags: [{ id: 'tag-react', name: 'React' }],
        thumbnail: null,
      },
    ];
    mockedArticleCache.getEmbeddingRelatedArticles.mockResolvedValueOnce(cachedResults);

    const response = await GET(createRequest(), {
      params: Promise.resolve({ id: articleId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.metadata.algorithm).toBe('embedding');
    expect(body.articles[0].id).toBe('embedding-cached');
    expect(body.articles[0].commonTags).toBe(1);
    expect(mockedVectorSearch.searchByArticleId).not.toHaveBeenCalled();
  });

  test('falls back to tag-based results when algorithm=auto and embedding fails', async () => {
    mockedVectorSearch.searchByArticleId.mockRejectedValueOnce(new Error('embedding failed'));

    const response = await GET(createRequest('?algorithm=auto'), {
      params: Promise.resolve({ id: articleId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.metadata.algorithm).toBe('tag');
    expect(body.metadata.source).toBe('tag_fallback');
    expect(body.articles).toHaveLength(1);
    expect(mockedArticleCache.getRelatedArticles).toHaveBeenCalledTimes(1);
  });

  test('returns 400 for invalid algorithm parameter', async () => {
    const response = await GET(createRequest('?algorithm=invalid'), {
      params: Promise.resolve({ id: articleId }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid query parameters');
    expect(mockedArticleCache.getArticleWithRelations).not.toHaveBeenCalled();
  });

  test('returns embedding results with Japanese translatedTitle', async () => {
    const embeddingResults: SearchResult[] = [
      {
        articleId: 'embedding-ja',
        title: 'English Title',
        summary: 'Summary',
        translatedTitle: '日本語タイトル',
        similarity: 0.85,
        publishedAt: new Date('2025-01-05T00:00:00Z'),
        sourceId: 'source-3',
        sourceName: 'JP Source',
        embeddingKey: 'summary',
        qualityScore: 90,
        tags: [{ id: 'tag-react', name: 'React' }],
        thumbnail: null,
      },
    ];

    mockedVectorSearch.searchByArticleId.mockResolvedValueOnce(embeddingResults);

    const response = await GET(createRequest('?algorithm=embedding'), {
      params: Promise.resolve({ id: articleId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.articles[0].translatedTitle).toBe('日本語タイトル');
  });
});
