/**
 * /api/trends/semantic-atlas エンドポイントのテスト
 * /api/trends/semantic-atlas/[articleId] エンドポイントのテスト
 */

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_key: string, handler: Function) => handler),
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    articleProjection: {
      findMany: jest.fn(),
    },
    article: {
      findUnique: jest.fn(),
    },
    $queryRawUnsafe: jest.fn(),
  },
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import { GET as listGET } from '@/app/api/trends/semantic-atlas/route';
import { GET as detailGET } from '@/app/api/trends/semantic-atlas/[articleId]/route';
import { prisma } from '@/lib/database';
import { NextRequest } from 'next/server';

const prismaMock = prisma as any;

function createListRequest(
  params: Record<string, string> = {}
): NextRequest {
  const url = new URL('http://localhost:3000/api/trends/semantic-atlas');
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return new NextRequest(url);
}

function createDetailRequest(articleId: string): {
  request: NextRequest;
  context: { params: Promise<{ articleId: string }> };
} {
  const url = new URL(
    `http://localhost:3000/api/trends/semantic-atlas/${articleId}`
  );
  return {
    request: new NextRequest(url),
    context: { params: Promise.resolve({ articleId }) },
  };
}

describe('/api/trends/semantic-atlas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------- List API tests -------

  describe('GET /api/trends/semantic-atlas (list)', () => {
    it('returns points and clusters (200)', async () => {
      const now = new Date('2026-02-01T00:00:00Z');
      prismaMock.articleProjection.findMany.mockResolvedValueOnce([
        {
          articleId: 'a1',
          x2d: 0.1,
          y2d: 0.2,
          x3d: 1.0,
          y3d: 2.0,
          z3d: 3.0,
          clusterId: 0,
          computedAt: now,
          article: { category: 'ai_ml' },
        },
        {
          articleId: 'a2',
          x2d: 0.5,
          y2d: 0.6,
          x3d: 4.0,
          y3d: 5.0,
          z3d: 6.0,
          clusterId: 1,
          computedAt: now,
          article: { category: 'frontend' },
        },
      ]);

      prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
        {
          clusterId: 0,
          count: BigInt(1),
          centroidX: 1.0,
          centroidY: 2.0,
          centroidZ: 3.0,
        },
        {
          clusterId: 1,
          count: BigInt(1),
          centroidX: 4.0,
          centroidY: 5.0,
          centroidZ: 6.0,
        },
      ]);

      const response = await listGET(createListRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.points).toHaveLength(2);
      expect(data.points[0]).toEqual({
        articleId: 'a1',
        x2d: 0.1,
        y2d: 0.2,
        x3d: 1.0,
        y3d: 2.0,
        z3d: 3.0,
        clusterId: 0,
        category: 'ai_ml',
      });
      expect(data.clusters).toHaveLength(2);
      expect(data.clusters[0]).toEqual({
        id: 0,
        count: 1,
        centroidX: 1.0,
        centroidY: 2.0,
        centroidZ: 3.0,
      });
      expect(data.totalCount).toBe(2);
      expect(data.generatedAt).toBe(now.toISOString());
      expect(response.headers.get('Cache-Control')).toBe(
        'public, s-maxage=3600, stale-while-revalidate=7200'
      );
    });

    it('applies category filter (?category=ai_ml)', async () => {
      prismaMock.articleProjection.findMany.mockResolvedValueOnce([]);
      prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);

      await listGET(createListRequest({ category: 'ai_ml' }));

      expect(prismaMock.articleProjection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            article: { category: 'ai_ml' },
          }),
        })
      );
    });

    it('applies cluster filter (?cluster=5)', async () => {
      prismaMock.articleProjection.findMany.mockResolvedValueOnce([]);
      prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);

      await listGET(createListRequest({ cluster: '5' }));

      expect(prismaMock.articleProjection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clusterId: 5,
          }),
        })
      );
    });

    it('returns empty results when no projections exist', async () => {
      prismaMock.articleProjection.findMany.mockResolvedValueOnce([]);
      prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);

      const response = await listGET(createListRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.points).toHaveLength(0);
      expect(data.clusters).toHaveLength(0);
      expect(data.totalCount).toBe(0);
      expect(data.generatedAt).toBeDefined();
    });

    it('returns 400 for invalid category', async () => {
      const response = await listGET(
        createListRequest({ category: 'not_a_category' })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid category');
    });

    it('returns 400 for invalid cluster param', async () => {
      const response = await listGET(
        createListRequest({ cluster: 'abc' })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid cluster parameter');
    });

    it('returns 400 for negative cluster param', async () => {
      const response = await listGET(
        createListRequest({ cluster: '-1' })
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid cluster parameter');
    });

    it('returns 500 when database fails', async () => {
      prismaMock.articleProjection.findMany.mockRejectedValueOnce(
        new Error('DB error')
      );

      const response = await listGET(createListRequest());
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeDefined();
    });

    it('handles null article category as unknown', async () => {
      const now = new Date('2026-02-01T00:00:00Z');
      prismaMock.articleProjection.findMany.mockResolvedValueOnce([
        {
          articleId: 'a1',
          x2d: 0.1,
          y2d: 0.2,
          x3d: 1.0,
          y3d: 2.0,
          z3d: 3.0,
          clusterId: 0,
          computedAt: now,
          article: { category: null },
        },
      ]);
      prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);

      const response = await listGET(createListRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.points[0].category).toBe('unknown');
    });
  });

  // ------- Detail API tests -------

  describe('GET /api/trends/semantic-atlas/[articleId] (detail)', () => {
    it('returns article details (200)', async () => {
      const publishedAt = new Date('2026-01-15T12:00:00Z');
      prismaMock.article.findUnique.mockResolvedValueOnce({
        id: 'article-1',
        title: 'Test Article',
        summary: 'Short summary',
        detailedSummary: 'Detailed summary here',
        category: 'ai_ml',
        url: 'https://example.com/article-1',
        publishedAt,
        source: { name: 'TechBlog' },
      });

      const { request, context } = createDetailRequest('article-1');
      const response = await (detailGET as any)(request, context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        articleId: 'article-1',
        title: 'Test Article',
        summary: 'Detailed summary here',
        category: 'ai_ml',
        source: 'TechBlog',
        publishedAt: publishedAt.toISOString(),
        url: 'https://example.com/article-1',
      });
      expect(response.headers.get('Cache-Control')).toBe(
        'public, s-maxage=3600, stale-while-revalidate=7200'
      );
    });

    it('falls back to summary when detailedSummary is null', async () => {
      const publishedAt = new Date('2026-01-15T12:00:00Z');
      prismaMock.article.findUnique.mockResolvedValueOnce({
        id: 'article-2',
        title: 'Test Article 2',
        summary: 'Fallback summary',
        detailedSummary: null,
        category: 'backend',
        url: 'https://example.com/article-2',
        publishedAt,
        source: { name: 'DevBlog' },
      });

      const { request, context } = createDetailRequest('article-2');
      const response = await (detailGET as any)(request, context);
      const data = await response.json();

      expect(data.summary).toBe('Fallback summary');
    });

    it('returns empty string when both summaries are null', async () => {
      const publishedAt = new Date('2026-01-15T12:00:00Z');
      prismaMock.article.findUnique.mockResolvedValueOnce({
        id: 'article-3',
        title: 'No Summary',
        summary: null,
        detailedSummary: null,
        category: null,
        url: 'https://example.com/article-3',
        publishedAt,
        source: { name: 'Source' },
      });

      const { request, context } = createDetailRequest('article-3');
      const response = await (detailGET as any)(request, context);
      const data = await response.json();

      expect(data.summary).toBe('');
      expect(data.category).toBe('unknown');
    });

    it('returns 404 when article not found', async () => {
      prismaMock.article.findUnique.mockResolvedValueOnce(null);

      const { request, context } = createDetailRequest('nonexistent');
      const response = await (detailGET as any)(request, context);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Article not found');
    });

    it('returns 500 when database fails', async () => {
      prismaMock.article.findUnique.mockRejectedValueOnce(
        new Error('DB error')
      );

      const { request, context } = createDetailRequest('article-1');
      const response = await (detailGET as any)(request, context);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeDefined();
    });
  });
});
