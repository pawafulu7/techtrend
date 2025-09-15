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

jest.mock('@/lib/auth/auth', () => ({
  auth: jest.fn().mockResolvedValue(null),
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
