import { executeDirectSearch } from '@/app/api/rag/agent-search/direct-search-handler';

// Mock VectorSearchService
const mockSearchWithFallback = jest.fn();
jest.mock('@/lib/rag/vector-search-service', () => ({
  VectorSearchService: jest.fn().mockImplementation(() => ({
    searchWithFallback: mockSearchWithFallback,
  })),
  SearchResult: {},
}));

// Mock prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('executeDirectSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockResults = [
    {
      articleId: 'art1',
      title: 'React 19 Release',
      summary: 'React 19 introduces new features...',
      translatedTitle: 'React 19 リリース',
      similarity: 0.85,
      publishedAt: new Date('2026-03-10'),
      sourceId: 'src1',
      embeddingKey: 'summary',
    },
    {
      articleId: 'art2',
      title: 'Next.js 16 Update',
      summary: 'Next.js 16 brings improvements...',
      translatedTitle: null,
      similarity: 0.72,
      publishedAt: new Date('2026-03-08'),
      sourceId: 'src2',
      embeddingKey: 'summary',
    },
  ];

  const mockMetadata = {
    phase: 1 as const,
    finalThreshold: 0.5,
    attemptCount: 1,
    usedFallback: false,
  };

  it('should return results in DirectSearchResult format', async () => {
    mockSearchWithFallback.mockResolvedValueOnce({
      results: mockResults,
      metadata: mockMetadata,
    });

    const result = await executeDirectSearch('React latest', 'ja');

    expect(result.query).toBe('React latest');
    expect(result.response).toContain('検索結果');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('semantic-article-search');
    expect(result.toolCalls[0].output).toHaveProperty('articles');
    expect(result.toolCalls[0].output).toHaveProperty('count', 2);
    expect(result.toolCalls[0].output).toHaveProperty('originalQuery', 'React latest');
    expect(result.toolCalls[0].output).toHaveProperty('fallbackMetadata');
    expect(result.usage).toEqual({ totalTokens: 0 });
    expect(result.fallback).toBe(false);
    expect(result.cached).toBe(false);
  });

  it('should apply temporal query parsing', async () => {
    mockSearchWithFallback.mockResolvedValueOnce({
      results: mockResults,
      metadata: mockMetadata,
    });

    await executeDirectSearch('最新のReact記事', 'ja');

    // searchWithFallback should be called with parsed query
    expect(mockSearchWithFallback).toHaveBeenCalledWith(
      'React記事', // cleanQuery after temporal parsing
      expect.objectContaining({
        enableFallback: true,
        topK: 10,
        embeddingKey: 'summary',
        dateRange: expect.any(Object),
        recencyBoost: expect.any(Number),
      })
    );
  });

  it('should clamp recencyBoost to max 1.0', async () => {
    mockSearchWithFallback.mockResolvedValueOnce({
      results: [],
      metadata: { ...mockMetadata, phase: null },
    });

    await executeDirectSearch('最新のtest', 'ja');

    // recencyBoost from "最新" is 2.0, should be clamped to 1.0
    expect(mockSearchWithFallback).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        recencyBoost: 1.0, // clamped from 2.0
      })
    );
  });

  it('should return empty results format when no results found', async () => {
    mockSearchWithFallback.mockResolvedValueOnce({
      results: [],
      metadata: { phase: null, finalThreshold: 0.5, attemptCount: 1, usedFallback: false },
    });

    const result = await executeDirectSearch('nonexistent query', 'ja');

    expect(result.toolCalls[0].output).toHaveProperty('count', 0);
    expect(result.response).toContain('見つかりませんでした');
  });

  it('should handle English language preference', async () => {
    mockSearchWithFallback.mockResolvedValueOnce({
      results: mockResults,
      metadata: mockMetadata,
    });

    const result = await executeDirectSearch('React query', 'en');
    expect(result.response).toContain('Found');
  });

  it('should throw on aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      executeDirectSearch('test', 'ja', { signal: controller.signal })
    ).rejects.toThrow('Request aborted');
  });

  it('should include summary in article output', async () => {
    mockSearchWithFallback.mockResolvedValueOnce({
      results: mockResults,
      metadata: mockMetadata,
    });

    const result = await executeDirectSearch('React', 'ja');

    const articles = (result.toolCalls[0].output as any).articles;
    expect(articles[0]).toHaveProperty('summary', 'React 19 introduces new features...');
    expect(articles[1]).toHaveProperty('summary', 'Next.js 16 brings improvements...');
  });
});
