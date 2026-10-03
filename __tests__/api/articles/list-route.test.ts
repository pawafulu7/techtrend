/**
 * 軽量版API (/api/articles/list) のテストスイート
 * 
 * 検証項目:
 * - sourceリレーションが含まれること
 * - レスポンス型の完全性
 * - パフォーマンス（tagsを含まない軽量化）
 */

// モックを先に設定
jest.mock('@/lib/prisma');

jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    generateCacheKey: jest.fn().mockReturnValue('test-cache-key'),
  })),
}));

jest.mock('@/lib/auth/get-session', () => ({
  getSession: jest.fn().mockResolvedValue(null),
}));

// タグ名をそのまま 1 件の ID に解決する（tagMode の解釈だけを確かめるため）
jest.mock('@/lib/services/tag-service', () => ({
  findTagIdGroupsByNames: jest.fn((names: string[]) =>
    Promise.resolve(names.map((name) => [`id-${name}`]))
  ),
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/articles/list/route';
import { prisma } from '@/lib/prisma';
import { RedisCache } from '@/lib/cache';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('/api/articles/list', () => {
  const mockArticles = [
    {
      id: '1',
      title: 'Test Article 1',
      url: 'https://example.com/1',
      summary: 'Summary 1',
      thumbnail: 'https://example.com/thumb1.jpg',
      publishedAt: new Date('2025-09-01'),
      sourceId: 'source1',
      source: {
        id: 'source1',
        name: 'Speaker Deck',
        type: 'PRESENTATION',
        url: 'https://speakerdeck.com',
      },
      category: null,
      qualityScore: 85,
      bookmarks: 10,
      userVotes: 5,
      createdAt: new Date('2025-09-01'),
      updatedAt: new Date('2025-09-01'),
    },
    {
      id: '2',
      title: 'Test Article 2',
      url: 'https://example.com/2',
      summary: 'Summary 2',
      thumbnail: 'https://example.com/thumb2.jpg',
      publishedAt: new Date('2025-09-02'),
      sourceId: 'source2',
      source: {
        id: 'source2',
        name: 'Docswell',
        type: 'PRESENTATION',
        url: 'https://docswell.com',
      },
      category: null,
      qualityScore: 90,
      bookmarks: 15,
      userVotes: 8,
      createdAt: new Date('2025-09-02'),
      updatedAt: new Date('2025-09-02'),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should include source relation in response', async () => {
    // Arrange
    mockPrisma.article.count = jest.fn().mockResolvedValue(2);
    mockPrisma.article.findMany = jest.fn().mockResolvedValue(mockArticles);

    const request = new NextRequest('http://localhost:3000/api/articles/list?page=1&limit=20');

    // Act
    const response = await GET(request);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.items).toHaveLength(2);
    
    // 重要: sourceリレーションが含まれていることを確認
    expect(data.data.items[0].source).toBeDefined();
    expect(data.data.items[0].source.name).toBe('Speaker Deck');
    expect(data.data.items[1].source).toBeDefined();
    expect(data.data.items[1].source.name).toBe('Docswell');
  });

  it('should have correct source object structure', async () => {
    // Arrange
    mockPrisma.article.count = jest.fn().mockResolvedValue(1);
    mockPrisma.article.findMany = jest.fn().mockResolvedValue([mockArticles[0]]);

    const request = new NextRequest('http://localhost:3000/api/articles/list');

    // Act
    const response = await GET(request);
    const data = await response.json();

    // Assert
    const source = data.data.items[0].source;
    expect(source).toHaveProperty('id');
    expect(source).toHaveProperty('name');
    expect(source).toHaveProperty('type');
    expect(source).toHaveProperty('url');
    
    // sourceオブジェクトが正しい型を持つことを確認
    expect(typeof source.id).toBe('string');
    expect(typeof source.name).toBe('string');
    expect(typeof source.type).toBe('string');
    expect(typeof source.url).toBe('string');
  });

  it('should call prisma.findMany with source select', async () => {
    // Arrange
    mockPrisma.article.count = jest.fn().mockResolvedValue(0);
    mockPrisma.article.findMany = jest.fn().mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/articles/list');

    // Act
    await GET(request);

    // Assert
    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          source: {
            select: {
              id: true,
              name: true,
              type: true,
              url: true,
            }
          }
        })
      })
    );
  });

  it('should not include heavy fields for performance optimization', async () => {
    // Arrange
    mockPrisma.article.count = jest.fn().mockResolvedValue(1);
    mockPrisma.article.findMany = jest.fn().mockResolvedValue([mockArticles[0]]);

    const request = new NextRequest('http://localhost:3000/api/articles/list');

    // Act
    const response = await GET(request);
    const data = await response.json();

    // Assert
    // 重いフィールドが含まれていないことを確認（パフォーマンス最適化）
    expect(data.data.items[0].tags).toBeUndefined();
    expect(data.data.items[0].content).toBeUndefined();
    expect(data.data.items[0].detailedSummary).toBeUndefined();
  });

  it('should handle NaN page parameter gracefully', async () => {
    mockPrisma.article.count = jest.fn().mockResolvedValue(0);
    mockPrisma.article.findMany = jest.fn().mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/articles/list?page=abc');

    const response = await GET(request);

    expect(response.status).toBe(200);
    // Should use default page=1, not produce NaN/500 error
    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0, // page=1 means skip=0
      })
    );
  });

  it('rejects more than 50 tags with 400 before querying (#681)', async () => {
    mockPrisma.article.count = jest.fn().mockResolvedValue(0);
    mockPrisma.article.findMany = jest.fn().mockResolvedValue([]);
    const tags = Array.from({ length: 51 }, (_, i) => `t${i}`).join(',');

    const response = await GET(
      new NextRequest(`http://localhost:3000/api/articles/list?tags=${tags}`)
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.code).toBe('INVALID_TAG_FILTER');
    expect(mockPrisma.article.findMany).not.toHaveBeenCalled();
  });

  it('searches with only the first 10 keywords (#684)', async () => {
    mockPrisma.article.count = jest.fn().mockResolvedValue(0);
    mockPrisma.article.findMany = jest.fn().mockResolvedValue([]);
    const search = Array.from({ length: 11 }, (_, i) => `w${i}`).join('%20');

    const response = await GET(
      new NextRequest(`http://localhost:3000/api/articles/list?search=${search}`)
    );

    expect(response.status).toBe(200);
    const { where } = (mockPrisma.article.findMany as jest.Mock).mock
      .calls[0][0];
    const keywords = (where.AND as any[])
      .filter((c) => c.OR?.[0]?.title?.contains !== undefined)
      .map((c) => c.OR[0].title.contains);
    expect(keywords).toEqual(Array.from({ length: 10 }, (_, i) => `w${i}`));
  });

  it('puts the normalized search into cursors, regardless of keyword order (#684)', async () => {
    mockPrisma.article.count = jest.fn().mockResolvedValue(2);
    mockPrisma.article.findMany = jest.fn().mockResolvedValue(mockArticles);
    const { getCursorManager } = jest.requireActual(
      '@/lib/pagination/cursor-manager'
    );
    const { normalizeSearchForCacheKey } = jest.requireActual(
      '@/app/api/articles/list/query-helpers'
    );

    const response = await GET(
      new NextRequest('http://localhost:3000/api/articles/list?search=foo%20bar')
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    const pageInfo = json.data?.pageInfo ?? json.pageInfo;
    const payload = getCursorManager().decodeCursor(pageInfo.endCursor);
    // キャッシュキーと同じ値なので、語の順番だけが違う検索とキャッシュを共有しても
    // カーソルの検証が食い違わない
    expect(payload.filters.search).toBe(normalizeSearchForCacheKey('bar foo'));
  });

  it('keeps search null in cursors when there is no search (#684)', async () => {
    mockPrisma.article.count = jest.fn().mockResolvedValue(2);
    mockPrisma.article.findMany = jest.fn().mockResolvedValue(mockArticles);
    const { getCursorManager } = jest.requireActual(
      '@/lib/pagination/cursor-manager'
    );

    const response = await GET(
      new NextRequest('http://localhost:3000/api/articles/list')
    );

    const json = await response.json();
    const pageInfo = json.data?.pageInfo ?? json.pageInfo;
    const payload = getCursorManager().decodeCursor(pageInfo.endCursor);
    // 検索なしのキャッシュキーは #684 の前後で同じなので、キャッシュ済みのカーソル
    // （search: null）と食い違わないよう null のままにする
    expect(payload.filters.search).toBeNull();
  });

  it('should handle NaN limit parameter gracefully', async () => {
    mockPrisma.article.count = jest.fn().mockResolvedValue(0);
    mockPrisma.article.findMany = jest.fn().mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/articles/list?limit=xyz');

    const response = await GET(request);

    expect(response.status).toBe(200);
    // Should use default limit=20
    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 20,
      })
    );
  });

  it('should fallback invalid sortOrder to desc', async () => {
    mockPrisma.article.count = jest.fn().mockResolvedValue(0);
    mockPrisma.article.findMany = jest.fn().mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/articles/list?sortOrder=invalid');

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { publishedAt: 'desc' },
          { id: 'desc' },
        ],
      })
    );
  });

  it('should accept valid sortOrder asc', async () => {
    mockPrisma.article.count = jest.fn().mockResolvedValue(0);
    mockPrisma.article.findMany = jest.fn().mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/articles/list?sortOrder=asc');

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { publishedAt: 'asc' },
          { id: 'asc' },
        ],
      })
    );
  });

  it('treats sortOrder case-insensitively (#684)', async () => {
    mockPrisma.article.count = jest.fn().mockResolvedValue(0);
    mockPrisma.article.findMany = jest.fn().mockResolvedValue([]);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/articles/list?sortOrder=ASC')
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
      })
    );
  });

  it.each(['AND', 'and', 'And'])(
    'treats tagMode=%s as AND (#684)',
    async (tagMode) => {
      mockPrisma.article.count = jest.fn().mockResolvedValue(0);
      mockPrisma.article.findMany = jest.fn().mockResolvedValue([]);

      const response = await GET(
        new NextRequest(
          `http://localhost:3000/api/articles/list?tags=AI,LLM&tagMode=${tagMode}`
        )
      );

      expect(response.status).toBe(200);
      const { where } = (mockPrisma.article.findMany as jest.Mock).mock
        .calls[0][0];
      // AND は組ごとに条件を足し、tags の OR 条件は付けない
      expect(where.tags).toBeUndefined();
      expect(where.AND).toEqual(
        expect.arrayContaining([
          { tags: { some: { id: { in: ['id-AI'] } } } },
          { tags: { some: { id: { in: ['id-LLM'] } } } },
        ])
      );
    }
  );

  it.each(['OR', 'or', 'xyz'])(
    'treats tagMode=%s as OR (#684)',
    async (tagMode) => {
      mockPrisma.article.count = jest.fn().mockResolvedValue(0);
      mockPrisma.article.findMany = jest.fn().mockResolvedValue([]);

      const response = await GET(
        new NextRequest(
          `http://localhost:3000/api/articles/list?tags=AI,LLM&tagMode=${tagMode}`
        )
      );

      expect(response.status).toBe(200);
      const { where } = (mockPrisma.article.findMany as jest.Mock).mock
        .calls[0][0];
      expect(where.tags).toEqual({
        some: { id: { in: ['id-AI', 'id-LLM'] } },
      });
    }
  );

  it('should handle articles from specific sources correctly', async () => {
    // Arrange - Speaker Deckの記事をテスト
    const speakerDeckArticle = {
      ...mockArticles[0],
      source: {
        id: 'speaker-deck',
        name: 'Speaker Deck',
        type: 'PRESENTATION',
        url: 'https://speakerdeck.com',
      }
    };

    mockPrisma.article.count = jest.fn().mockResolvedValue(1);
    mockPrisma.article.findMany = jest.fn().mockResolvedValue([speakerDeckArticle]);

    const request = new NextRequest('http://localhost:3000/api/articles/list');

    // Act
    const response = await GET(request);
    const data = await response.json();

    // Assert
    expect(data.data.items[0].source.name).toBe('Speaker Deck');
    // ArticleCardコンポーネントがこの情報を使用できることを確認
    expect(data.data.items[0].thumbnail).toBeDefined();
  });
});
