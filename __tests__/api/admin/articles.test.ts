import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/lib/auth/auth');

// prismaモック - @/lib/prismaをモック（@/lib/databaseではない）
jest.mock('@/lib/prisma', () => ({
  prisma: {
    article: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    source: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_key: string, handler: any) => handler),
}));

jest.mock('@/lib/middleware/with-admin-auth', () => ({
  withAdminAuth: jest.fn((handler: any) => {
    return (request: any, context: any) => {
      return handler(request, {
        ...context,
        session: {
          user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' },
        },
      });
    };
  }),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// モックデータ
const mockArticleRaw = {
  id: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
  title: 'Test Article',
  translatedTitle: 'テスト記事',
  url: 'https://example.com/article',
  publishedAt: new Date('2026-03-01'),
  sourceId: 'src-1',
  source: { name: 'Test Source' },
  category: 'frontend',
  qualityScore: 85,
  summary: 'Test summary',
  content: 'Test content',
  skipReason: null,
  summaryError: null,
  bookmarks: 10,
};

const mockArticleDetail = {
  ...mockArticleRaw,
  source: { id: 'src-1', name: 'Test Source' },
  tags: [{ id: 'tag-1', name: 'React' }],
  detailedSummary: 'Detailed summary',
  contentLength: 100,
  difficulty: 'intermediate',
  articleType: 'tutorial',
  summaryVersion: 8,
  summaryComputedAt: new Date('2026-03-01'),
  qualityScoreComputedAt: new Date('2026-03-01'),
  contentUpdatedAt: null,
  userVotes: 5,
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-01'),
};

const mockSources = [
  { id: 'src-1', name: 'Source A', enabled: true },
  { id: 'src-2', name: 'Source B', enabled: true },
];

function createRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/admin/articles');
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  return new NextRequest(url);
}

// -----------------------------------------------------------------------
// 一覧API
// -----------------------------------------------------------------------
describe('GET /api/admin/articles', () => {
  let GET: any;

  beforeAll(async () => {
    const mod = await import('@/app/api/admin/articles/route');
    GET = mod.GET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('デフォルトパラメータで記事一覧を返す', async () => {
    (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([mockArticleRaw]);
    // count: totalCount(=50) + getQualitySummary の7回分
    (mockPrisma.article.count as jest.Mock)
      .mockResolvedValueOnce(50) // totalCount
      .mockResolvedValueOnce(100) // qualitySummary: totalArticles
      .mockResolvedValueOnce(10)  // missingSummary
      .mockResolvedValueOnce(5)   // missingCategory
      .mockResolvedValueOnce(3)   // missingContent
      .mockResolvedValueOnce(2)   // lowQuality
      .mockResolvedValueOnce(1)   // hasError
      .mockResolvedValueOnce(4);  // skipped
    (mockPrisma.source.findMany as jest.Mock).mockResolvedValue(mockSources);

    const response = await GET(createRequest(), {});
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.articles).toHaveLength(1);
    expect(data.totalCount).toBe(50);
    expect(data.qualitySummary).toEqual(
      expect.objectContaining({
        totalArticles: 100,
        missingSummary: 10,
        missingCategory: 5,
        missingContent: 3,
        lowQuality: 2,
        hasError: 1,
        skipped: 4,
      })
    );
    expect(data.sources).toHaveLength(2);
  });

  it('ページネーション: page=2&perPage=10 で skip/take が正しく設定される', async () => {
    (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.article.count as jest.Mock)
      .mockResolvedValueOnce(25) // totalCount
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    (mockPrisma.source.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET(createRequest({ page: '2', perPage: '10' }), {});
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
    expect(data.totalPages).toBe(3); // ceil(25/10)
    expect(data.page).toBe(2);
    expect(data.perPage).toBe(10);
  });

  it('ソースフィルタ: sourceId 指定で where 条件に sourceId が含まれる', async () => {
    (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.article.count as jest.Mock)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    (mockPrisma.source.findMany as jest.Mock).mockResolvedValue([]);

    await GET(createRequest({ sourceId: 'src-1' }), {});

    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ sourceId: 'src-1' }]),
        }),
      })
    );
  });

  it('カテゴリフィルタ: category=frontend で where 条件に category が含まれる', async () => {
    (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.article.count as jest.Mock)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    (mockPrisma.source.findMany as jest.Mock).mockResolvedValue([]);

    await GET(createRequest({ category: 'frontend' }), {});

    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ category: 'frontend' }]),
        }),
      })
    );
  });

  it('品質ステータスフィルタ: qualityStatus=missing_summary で OR 条件が設定される', async () => {
    (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.article.count as jest.Mock)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    (mockPrisma.source.findMany as jest.Mock).mockResolvedValue([]);

    await GET(createRequest({ qualityStatus: 'missing_summary' }), {});

    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { OR: [{ summary: null }, { summary: '' }] },
          ]),
        }),
      })
    );
  });

  it('検索クエリ: query=React で title/translatedTitle/summary に contains 条件が設定される', async () => {
    (mockPrisma.article.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.article.count as jest.Mock)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    (mockPrisma.source.findMany as jest.Mock).mockResolvedValue([]);

    await GET(createRequest({ query: 'React' }), {});

    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: expect.arrayContaining([
                { title: { contains: 'React', mode: 'insensitive' } },
                { translatedTitle: { contains: 'React', mode: 'insensitive' } },
                { summary: { contains: 'React', mode: 'insensitive' } },
              ]),
            },
          ]),
        }),
      })
    );
  });

  it('不正なクエリパラメータで 400 を返す', async () => {
    const response = await GET(createRequest({ page: '0' }), {});
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid query parameters');
  });
});

// -----------------------------------------------------------------------
// 詳細API
// -----------------------------------------------------------------------
describe('GET /api/admin/articles/[id]', () => {
  let GET: any;

  beforeAll(async () => {
    const mod = await import('@/app/api/admin/articles/[id]/route');
    GET = mod.GET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('記事詳細を返す', async () => {
    (mockPrisma.article.findUnique as jest.Mock).mockResolvedValue(mockArticleDetail);

    const context = { params: Promise.resolve({ id: 'clxxxxxxxxxxxxxxxxxxxxxxxxx' }) };
    const response = await GET(new NextRequest('http://localhost/api/admin/articles/clxxxxxxxxxxxxxxxxxxxxxxxxx'), context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe('clxxxxxxxxxxxxxxxxxxxxxxxxx');
    expect(data.title).toBe('Test Article');
    expect(data.tags).toEqual([{ id: 'tag-1', name: 'React' }]);
    expect(mockPrisma.article.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'clxxxxxxxxxxxxxxxxxxxxxxxxx' },
      })
    );
  });

  it('存在しないIDで 404 を返す', async () => {
    (mockPrisma.article.findUnique as jest.Mock).mockResolvedValue(null);

    const context = { params: Promise.resolve({ id: 'clxxxxxxxxxxxxxxxxxxxxxxxxx' }) };
    const response = await GET(new NextRequest('http://localhost/api/admin/articles/clxxxxxxxxxxxxxxxxxxxxxxxxx'), context);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Article not found');
  });

  it('不正なID形式で 400 を返す', async () => {
    const context = { params: Promise.resolve({ id: 'invalid-id' }) };
    const response = await GET(new NextRequest('http://localhost/api/admin/articles/invalid-id'), context);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid article ID');
  });
});
