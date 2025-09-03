/**
 * /api/articles エンドポイントの拡張テスト
 * カバレッジ改善のため、既存テストでカバーされていない部分をテスト
 */

// グローバル型宣言
declare global {
  var __mockCacheInstance: any;
}

// モックの設定
jest.mock('@/lib/database');
jest.mock('@/lib/auth/auth');

// モックインスタンスを保持する変数
let mockCacheInstance: any;

jest.mock('@/lib/cache', () => {
  const { createRedisCacheMock } = require('../../helpers/cache-mock-helpers');
  // グローバルスコープでのmockCacheInstance参照を避ける
  return {
    RedisCache: jest.fn().mockImplementation(function() {
      // thisを使って、インスタンスごとにモックを管理
      if (!global.__mockCacheInstance) {
        global.__mockCacheInstance = createRedisCacheMock();
      }
      return global.__mockCacheInstance;
    })
  };
});

import { GET } from '@/app/api/articles/route';
import { prisma } from '@/lib/database';
import { auth } from '@/lib/auth/auth';
import { RedisCache } from '@/lib/cache';
import { NextRequest } from 'next/server';

const prismaMock = prisma as any;
const authMock = auth as jest.MockedFunction<typeof auth>;
const RedisCacheMock = RedisCache as jest.MockedClass<typeof RedisCache>;

// モック関数のヘルパー
const setUnauthenticated = () => authMock.mockResolvedValue(null);
const resetMockSession = () => authMock.mockResolvedValue({
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User'
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
});

describe('/api/articles - Extended Tests', () => {
  const mockArticles = [
    {
      id: 'article1',
      title: 'Test Article 1',
      url: 'https://example.com/1',
      summary: 'Summary 1',
      content: 'Content 1',
      publishedAt: new Date('2025-01-01'),
      sourceId: 'qiita',
      category: 'TECH',
      tags: [
        { id: 't1', name: 'React' },
        { id: 't2', name: 'TypeScript' },
      ],
      source: {
        id: 'qiita',
        name: 'Qiita',
        type: 'api',
      },
      articleViews: [],
    },
    {
      id: 'article2',
      title: 'Test Article 2',
      url: 'https://example.com/2',
      summary: 'Summary 2',
      content: 'Content 2',
      publishedAt: new Date('2025-01-02'),
      sourceId: 'zenn',
      category: null, // uncategorized
      tags: [
        { id: 't3', name: 'Vue' },
        { id: 't2', name: 'TypeScript' },
      ],
      source: {
        id: 'zenn',
        name: 'Zenn',
        type: 'rss',
      },
      articleViews: [
        {
          id: 'view1',
          userId: 'test-user-id',
          articleId: 'article2',
          isRead: true,
        }
      ],
    },
    {
      id: 'article3',
      title: 'Test Article 3',
      url: 'https://example.com/3',
      summary: 'Summary 3',
      content: 'Content 3',
      publishedAt: new Date('2025-01-03'),
      sourceId: 'devto',
      category: 'TECH',
      tags: [
        { id: 't1', name: 'React' },
        { id: 't4', name: 'JavaScript' },
      ],
      source: {
        id: 'devto',
        name: 'Dev.to',
        type: 'api',
      },
      articleViews: [
        {
          id: 'view2',
          userId: 'test-user-id',
          articleId: 'article3',
          isRead: false,
        }
      ],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    resetMockSession();
    
    // キャッシュモックのリセット（globalインスタンスを使用）
    const { createRedisCacheMock } = require('../../helpers/cache-mock-helpers');
    if (!global.__mockCacheInstance) {
      global.__mockCacheInstance = createRedisCacheMock();
    }
    mockCacheInstance = global.__mockCacheInstance;
    mockCacheInstance.get.mockResolvedValue(null);
    mockCacheInstance.set.mockResolvedValue(undefined);
    mockCacheInstance.generateCacheKey.mockClear();
    
    // デフォルトのPrismaモック設定
    prismaMock.article = {
      findMany: jest.fn().mockResolvedValue(mockArticles),
      count: jest.fn().mockResolvedValue(3),
    };
  });

  describe('GET - Read Filter Tests', () => {
    it('未読記事のみをフィルタリング（認証済み）', async () => {
      const unreadArticles = [mockArticles[0], mockArticles[2]]; // article1とarticle3
      prismaMock.article.findMany.mockResolvedValue(unreadArticles);
      prismaMock.article.count.mockResolvedValue(2);

      const request = new NextRequest('http://localhost/api/articles?readFilter=unread');
      const response = await GET(request);

      // デバッグ用
      if (response.status !== 200) {
        const errorData = await response.json();
        console.error('Response error:', errorData);
      }

      expect(response.status).toBe(200);
      const json = await response.json();
      
      expect(json.data.items).toHaveLength(2);
      
      // 未読フィルタの条件を確認
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [
              {
                OR: [
                  {
                    articleViews: {
                      none: {
                        userId: 'test-user-id'
                      }
                    }
                  },
                  {
                    articleViews: {
                      some: {
                        userId: 'test-user-id',
                        isRead: false
                      }
                    }
                  }
                ]
              }
            ]
          })
        })
      );
    });

    it('既読記事のみをフィルタリング（認証済み）', async () => {
      const readArticles = [mockArticles[1]]; // article2のみ
      prismaMock.article.findMany.mockResolvedValue(readArticles);
      prismaMock.article.count.mockResolvedValue(1);

      const request = new NextRequest('http://localhost/api/articles?readFilter=read');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      
      expect(json.data.items).toHaveLength(1);
      
      // 既読フィルタの条件を確認
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            articleViews: {
              some: {
                userId: 'test-user-id',
                isRead: true
              }
            }
          })
        })
      );
    });

    it('未認証の場合、readFilterは無視される', async () => {
      setUnauthenticated();

      const request = new NextRequest('http://localhost/api/articles?readFilter=unread');
      const response = await GET(request);

      expect(response.status).toBe(200);
      
      // 未認証の場合、readFilterの条件が適用されないことを確認
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            OR: expect.anything()
          })
        })
      );
    });
  });

  describe('GET - Multiple Tags with AND Mode', () => {
    it('複数タグをAND条件で検索', async () => {
      const filteredArticles = [mockArticles[0]]; // ReactとTypeScriptの両方を持つ
      prismaMock.article.findMany.mockResolvedValue(filteredArticles);
      prismaMock.article.count.mockResolvedValue(1);

      const request = new NextRequest('http://localhost/api/articles?tags=React,TypeScript&tagMode=AND');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      
      expect(json.data.items).toHaveLength(1);
      
      // AND条件の確認
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [
              {
                tags: {
                  some: {
                    name: 'React'
                  }
                }
              },
              {
                tags: {
                  some: {
                    name: 'TypeScript'
                  }
                }
              }
            ]
          })
        })
      );
    });

    it('複数タグをOR条件で検索（デフォルト）', async () => {
      prismaMock.article.findMany.mockResolvedValue(mockArticles);
      prismaMock.article.count.mockResolvedValue(3);

      const request = new NextRequest('http://localhost/api/articles?tags=React,Vue');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      
      expect(json.data.items).toHaveLength(3);
      
      // OR条件の確認（ANDフィールドが存在しない）
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tags: {
              some: {
                name: {
                  in: ['React', 'Vue']
                }
              }
            }
          })
        })
      );
    });

    it('空白を含むタグリストを正しく処理', async () => {
      prismaMock.article.findMany.mockResolvedValue([]);
      prismaMock.article.count.mockResolvedValue(0);

      const request = new NextRequest('http://localhost/api/articles?tags=React,%20,%20Vue,%20&tagMode=AND');
      const response = await GET(request);

      expect(response.status).toBe(200);
      
      // 空白がフィルタリングされることを確認
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [
              {
                tags: {
                  some: {
                    name: 'React'
                  }
                }
              },
              {
                tags: {
                  some: {
                    name: 'Vue'
                  }
                }
              }
            ]
          })
        })
      );
    });
  });

  describe('GET - Category Filter Tests', () => {
    it('未分類（uncategorized）記事をフィルタリング', async () => {
      const uncategorizedArticles = [mockArticles[1]]; // categoryがnullの記事
      prismaMock.article.findMany.mockResolvedValue(uncategorizedArticles);
      prismaMock.article.count.mockResolvedValue(1);

      const request = new NextRequest('http://localhost/api/articles?category=uncategorized');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      
      expect(json.data.items).toHaveLength(1);
      expect(json.data.items[0].category).toBe(null);
      
      // categoryがnullでフィルタリングされることを確認
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: null
          })
        })
      );
    });

    it('特定カテゴリー（TECH）でフィルタリング', async () => {
      const techArticles = [mockArticles[0], mockArticles[2]];
      prismaMock.article.findMany.mockResolvedValue(techArticles);
      prismaMock.article.count.mockResolvedValue(2);

      const request = new NextRequest('http://localhost/api/articles?category=TECH');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      
      expect(json.data.items).toHaveLength(2);
      
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'TECH'
          })
        })
      );
    });

    it('category=allの場合、フィルタリングしない', async () => {
      const request = new NextRequest('http://localhost/api/articles?category=all');
      const response = await GET(request);

      expect(response.status).toBe(200);
      
      // categoryフィールドが存在しないことを確認
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            category: expect.anything()
          })
        })
      );
    });
  });

  describe('GET - Combined Filters', () => {
    it('複数のフィルタを組み合わせて使用', async () => {
      const filteredArticles = [mockArticles[0]];
      prismaMock.article.findMany.mockResolvedValue(filteredArticles);
      prismaMock.article.count.mockResolvedValue(1);

      const request = new NextRequest('http://localhost/api/articles?category=TECH&tags=React,TypeScript&tagMode=AND&readFilter=unread');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      
      expect(json.data.items).toHaveLength(1);
      
      // 複数の条件が同時に適用されることを確認
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'TECH',
            AND: expect.any(Array)
          })
        })
      );
    });

    it.skip('sourceとカテゴリーとタグの組み合わせ', async () => {
      const filteredArticles = [];
      prismaMock.article.findMany.mockResolvedValue(filteredArticles);
      prismaMock.article.count.mockResolvedValue(0);

      const request = new NextRequest('http://localhost/api/articles?source=qiita&category=uncategorized&tags=React');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      
      expect(json.data.items).toHaveLength(0);
      
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceId: 'qiita',
            category: null,
            tags: expect.any(Object)
          })
        })
      );
    });
  });

  describe('GET - Edge Cases', () => {
    it('無効なreadFilterは無視される', async () => {
      const request = new NextRequest('http://localhost/api/articles?readFilter=invalid');
      const response = await GET(request);

      expect(response.status).toBe(200);
      
      // 無効なreadFilterは条件に含まれない
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            OR: expect.anything()
          })
        })
      );
    });

    it('空のタグリストは無視される', async () => {
      const request = new NextRequest('http://localhost/api/articles?tags=&tagMode=AND');
      const response = await GET(request);

      expect(response.status).toBe(200);
      
      // 空のタグリストは条件に含まれない
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            AND: expect.anything()
          })
        })
      );
    });

    it('全て空白のタグリストは無視される', async () => {
      const request = new NextRequest('http://localhost/api/articles?tags=%20,%20,%20&tagMode=AND');
      const response = await GET(request);

      expect(response.status).toBe(200);
      
      // 空白のみのタグリストは条件に含まれない（コンテンツフィルタリングは含まれる）
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            content: { not: null }
          }
        })
      );
    });
  });
});