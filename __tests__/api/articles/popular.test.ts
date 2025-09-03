import { GET } from '@/app/api/articles/popular/route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';

jest.mock('@/lib/database', () => ({
  prisma: {
    article: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    source: {
      findFirst: jest.fn(),
    },
    tag: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('@/lib/cache/popular-cache', () => ({
  popularCache: {
    getOrSet: jest.fn(async (period, fn) => {
      // キャッシュをバイパスして直接関数を実行
      return await fn();
    }),
  },
}));

describe('/api/articles/popular', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includeEmptyContent=trueの場合、空コンテンツの記事も含める', async () => {
    const mockArticles = [
      { id: '1', title: 'Test 1', content: 'Content', score: 100 },
      { id: '2', title: 'Test 2', content: null, score: 90 },
      { id: '3', title: 'Test 3', content: '', score: 80 },
    ];

    (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

    const request = new NextRequest(
      'http://localhost/api/articles/popular?includeEmptyContent=true'
    );
    
    const response = await GET(request);
    
    expect(prisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          AND: expect.arrayContaining([
            { content: { not: null } },
            { content: { not: '' } }
          ])
        })
      })
    );
    expect(response.status).toBe(200);
  });

  it('includeEmptyContent=falseまたは未指定の場合、空コンテンツの記事を除外', async () => {
    const mockArticles = [
      { id: '1', title: 'Test 1', content: 'Content', score: 100 },
    ];

    (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

    const request = new NextRequest(
      'http://localhost/api/articles/popular'
    );
    
    const response = await GET(request);
    
    expect(prisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            { content: { not: null } },
            { content: { not: '' } }
          ]
        })
      })
    );
    expect(response.status).toBe(200);
  });

  it('期間フィルターが正しく適用される', async () => {
    const mockArticles = [];
    (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

    const request = new NextRequest(
      'http://localhost/api/articles/popular?period=today'
    );
    
    await GET(request);
    
    expect(prisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publishedAt: expect.objectContaining({
            gte: expect.any(Date)
          })
        })
      })
    );
  });

  it('品質スコアフィルターが適用される', async () => {
    const mockArticles = [];
    (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

    const request = new NextRequest(
      'http://localhost/api/articles/popular'
    );
    
    await GET(request);
    
    expect(prisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          qualityScore: { gte: 30 }
        })
      })
    );
  });
});