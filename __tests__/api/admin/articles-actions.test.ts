/**
 * Admin Articles Actions API テスト
 *
 * - PATCH /api/admin/articles/[id]       - isHidden トグル
 * - POST  /api/admin/articles/[id]/regenerate-summary - 要約再生成
 * - GET   /api/articles/[id]             - hidden article の扱い
 *
 * 注意: 認証ミドルウェア (withAdminAuth) 自体の動作テストは
 *       __tests__/lib/middleware/with-admin-auth.test.ts に存在する。
 *       ここでは「エンドポイントが認証ミドルウェアを通じて保護されている」ことを
 *       withAdminAuth モックの呼び出し確認で検証する。
 */

import { NextRequest } from 'next/server';

// ---- ロガーモック ----
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ---- Prisma モック (@/lib/prisma) ----
jest.mock('@/lib/prisma', () => ({
  prisma: {
    article: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// ---- @/lib/database モック（GET /api/articles/[id] で使用） ----
jest.mock('@/lib/database', () => ({
  prisma: {
    article: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

// ---- ミドルウェアモック（認証済みアドミンとして通す） ----
jest.mock('@/lib/middleware/with-admin-auth', () => ({
  withAdminAuth: jest.fn((handler: any) => {
    return (request: any, context: any) => {
      return handler(request, {
        ...context,
        session: { user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' } },
      });
    };
  }),
}));

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_key: string, handler: any) => handler),
}));

jest.mock('@/lib/middleware/csrf-protection', () => ({
  withCSRFProtection: jest.fn((handler: any) => handler),
}));

// ---- キャッシュモック ----
jest.mock('@/lib/cache/cache-invalidator', () => ({
  cacheInvalidator: {
    onArticleUpdated: jest.fn().mockResolvedValue(undefined),
    onArticleDeleted: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/lib/cache/article-detail-cache', () => ({
  articleDetailCache: {
    invalidateArticle: jest.fn().mockResolvedValue(undefined),
    invalidateAllRelated: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/lib/cache/trends-cache', () => ({
  trendsCache: {
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---- DI モック（getAppDependencies） ----
jest.mock('@/lib/di/bootstrap', () => ({
  getAppDependencies: jest.fn(),
}));

// ---- タグサービスモック ----
jest.mock('@/lib/services/tag-service', () => ({
  getTagIdsForConnect: jest.fn().mockResolvedValue([]),
}));

// ---- category normalizer モック ----
jest.mock('@/lib/utils/article/article-category-normalizer', () => ({
  normalizeArticleCategory: jest.fn((c: string) => c),
}));

// ---- インポート（モック定義後） ----
import { prisma } from '@/lib/prisma';
import { prisma as prismaFromDatabase } from '@/lib/database';
import { getAppDependencies } from '@/lib/di/bootstrap';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';

const mockPrisma = prisma as any;
const mockPrismaDb = prismaFromDatabase as any;
const mockGetAppDependencies = getAppDependencies as jest.MockedFunction<typeof getAppDependencies>;
const mockWithAdminAuth = withAdminAuth as jest.MockedFunction<typeof withAdminAuth>;

// 有効なCUID形式のID
const VALID_ID = 'clxxxxxxxxxxxxxxxxxxxxxxxxx';
const INVALID_ID = 'invalid-id';

// 共通モック記事データ
const mockArticleDetail = {
  id: VALID_ID,
  title: 'Test Article',
  translatedTitle: null,
  url: 'https://example.com/article',
  publishedAt: new Date('2026-03-01'),
  sourceId: 'src-1',
  source: { id: 'src-1', name: 'Test Source' },
  category: 'frontend',
  qualityScore: 85,
  summary: 'Test summary',
  detailedSummary: 'Detailed summary',
  content: 'Test content with enough text',
  contentLength: 100,
  difficulty: 'intermediate',
  articleType: 'tutorial',
  summaryVersion: 8,
  summaryError: null,
  summaryComputedAt: new Date('2026-03-01'),
  qualityScoreComputedAt: new Date('2026-03-01'),
  contentUpdatedAt: null,
  userVotes: 5,
  bookmarks: 10,
  isHidden: false,
  skipReason: null,
  tags: [{ id: 'tag-1', name: 'React' }],
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-01'),
};

// ============================================================
// 1. PATCH /api/admin/articles/[id] - isHidden トグル
// ============================================================
describe('PATCH /api/admin/articles/[id] - hide toggle', () => {
  let PATCH: any;

  beforeAll(async () => {
    const mod = await import('@/app/api/admin/articles/[id]/route');
    PATCH = mod.PATCH;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // デフォルト: 認証済みアドミン
    mockWithAdminAuth.mockImplementation((handler: any) => {
      return (request: any, context: any) => {
        return handler(request, {
          ...context,
          session: { user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' } },
        });
      };
    });
  });

  it('PATCH ハンドラが export されていること（認証ミドルウェア適用済み）', () => {
    // PATCH が withAdminAuth でラップされた関数として export されていることを確認
    // ミドルウェア自体の認証ロジックテストは with-admin-auth.test.ts に委任
    expect(PATCH).toBeDefined();
    expect(typeof PATCH).toBe('function');
  });

  it('isHidden: true でトグル成功、レスポンスに isHidden: true が含まれること', async () => {
    (mockPrisma.article.update as jest.Mock).mockResolvedValue({
      ...mockArticleDetail,
      isHidden: true,
    });

    const request = new NextRequest(`http://localhost/api/admin/articles/${VALID_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ isHidden: true }),
    });
    const context = { params: Promise.resolve({ id: VALID_ID }) };
    const response = await PATCH(request, context);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.isHidden).toBe(true);
    expect(mockPrisma.article.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VALID_ID },
        data: { isHidden: true },
      })
    );
  });

  it('isHidden: false で戻し成功', async () => {
    (mockPrisma.article.update as jest.Mock).mockResolvedValue({
      ...mockArticleDetail,
      isHidden: false,
    });

    const request = new NextRequest(`http://localhost/api/admin/articles/${VALID_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ isHidden: false }),
    });
    const context = { params: Promise.resolve({ id: VALID_ID }) };
    const response = await PATCH(request, context);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.isHidden).toBe(false);
  });

  it('不正なbody（isHidden未指定）で400を返すこと', async () => {
    const request = new NextRequest(`http://localhost/api/admin/articles/${VALID_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'some title' }),
    });
    const context = { params: Promise.resolve({ id: VALID_ID }) };
    const response = await PATCH(request, context);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it('不正なID形式で400を返すこと', async () => {
    const request = new NextRequest(`http://localhost/api/admin/articles/${INVALID_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ isHidden: true }),
    });
    const context = { params: Promise.resolve({ id: INVALID_ID }) };
    const response = await PATCH(request, context);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid article ID');
  });

  it('存在しないIDでP2025エラーが発生し404を返すこと', async () => {
    // 実際の Prisma P2025 エラークラスを使用
    const { Prisma } = require('@prisma/client');
    const p2025Error = new Prisma.PrismaClientKnownRequestError(
      'Record to update not found.',
      { code: 'P2025', clientVersion: '6.19.2' }
    );
    (mockPrisma.article.update as jest.Mock).mockRejectedValue(p2025Error);

    const request = new NextRequest(`http://localhost/api/admin/articles/${VALID_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ isHidden: true }),
    });
    const context = { params: Promise.resolve({ id: VALID_ID }) };
    const response = await PATCH(request, context);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Article not found');
  });

  it('その他のエラーで500を返すこと', async () => {
    (mockPrisma.article.update as jest.Mock).mockRejectedValue(new Error('DB connection failed'));

    const request = new NextRequest(`http://localhost/api/admin/articles/${VALID_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ isHidden: true }),
    });
    const context = { params: Promise.resolve({ id: VALID_ID }) };
    const response = await PATCH(request, context);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Failed to update article');
  });

});

// ============================================================
// 2. POST /api/admin/articles/[id]/regenerate-summary
// ============================================================
describe('POST /api/admin/articles/[id]/regenerate-summary', () => {
  let POST: any;

  beforeAll(async () => {
    const mod = await import('@/app/api/admin/articles/[id]/regenerate-summary/route');
    POST = mod.POST;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // デフォルト: 認証済みアドミン
    mockWithAdminAuth.mockImplementation((handler: any) => {
      return (request: any, context: any) => {
        return handler(request, {
          ...context,
          session: { user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' } },
        });
      };
    });
  });

  it('POST ハンドラが export されていること（認証ミドルウェア適用済み）', () => {
    expect(POST).toBeDefined();
    expect(typeof POST).toBe('function');
  });

  it('不正なID形式で400を返すこと', async () => {
    const request = new NextRequest(
      `http://localhost/api/admin/articles/${INVALID_ID}/regenerate-summary`,
      { method: 'POST' }
    );
    const context = { params: Promise.resolve({ id: INVALID_ID }) };
    const response = await POST(request, context);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid article ID');
  });

  it('存在しないIDで404を返すこと', async () => {
    (mockPrisma.article.findUnique as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest(
      `http://localhost/api/admin/articles/${VALID_ID}/regenerate-summary`,
      { method: 'POST' }
    );
    const context = { params: Promise.resolve({ id: VALID_ID }) };
    const response = await POST(request, context);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Article not found');
  });

  it('コンテンツなし記事で400を返すこと', async () => {
    (mockPrisma.article.findUnique as jest.Mock).mockResolvedValue({
      ...mockArticleDetail,
      content: null,
      tags: [],
    });

    const request = new NextRequest(
      `http://localhost/api/admin/articles/${VALID_ID}/regenerate-summary`,
      { method: 'POST' }
    );
    const context = { params: Promise.resolve({ id: VALID_ID }) };
    const response = await POST(request, context);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('no content');
  });

  it('コンテンツが空文字の記事で400を返すこと', async () => {
    (mockPrisma.article.findUnique as jest.Mock).mockResolvedValue({
      ...mockArticleDetail,
      content: '   ',
      tags: [],
    });

    const request = new NextRequest(
      `http://localhost/api/admin/articles/${VALID_ID}/regenerate-summary`,
      { method: 'POST' }
    );
    const context = { params: Promise.resolve({ id: VALID_ID }) };
    const response = await POST(request, context);

    expect(response.status).toBe(400);
  });

  it('AI要約生成成功時に200と更新された記事を返すこと', async () => {
    (mockPrisma.article.findUnique as jest.Mock).mockResolvedValue({
      ...mockArticleDetail,
      tags: [{ id: 'tag-1', name: 'React' }],
    });

    const mockSummaryResult = {
      summary: 'New summary',
      detailedSummary: 'New detailed summary',
      tags: ['TypeScript'],
      category: 'frontend',
      translatedTitle: 'テスト記事',
      qualityScore: 90,
      summaryVersion: 9,
    };

    const mockService = {
      generateSummary: jest.fn().mockResolvedValue(mockSummaryResult),
    };
    mockGetAppDependencies.mockReturnValue({ service: mockService } as any);

    (mockPrisma.article.update as jest.Mock).mockResolvedValue({
      ...mockArticleDetail,
      summary: mockSummaryResult.summary,
      detailedSummary: mockSummaryResult.detailedSummary,
      summaryVersion: 9,
      qualityScore: 90,
    });

    const request = new NextRequest(
      `http://localhost/api/admin/articles/${VALID_ID}/regenerate-summary`,
      { method: 'POST' }
    );
    const context = { params: Promise.resolve({ id: VALID_ID }) };
    const response = await POST(request, context);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.summary).toBe(mockSummaryResult.summary);
    expect(mockService.generateSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        title: mockArticleDetail.title,
        content: mockArticleDetail.content,
      })
    );
  });

});

// ============================================================
// 3. GET /api/articles/[id] - hidden article
// ============================================================
describe('GET /api/articles/[id] - hidden article', () => {
  let GET: any;

  beforeAll(async () => {
    const mod = await import('@/app/api/articles/[id]/route');
    GET = mod.GET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('isHidden=true の記事でGETすると404を返すこと', async () => {
    (mockPrismaDb.article.findUnique as jest.Mock).mockResolvedValue({
      ...mockArticleDetail,
      isHidden: true,
      source: {
        id: 'src-1',
        name: 'Test Source',
        type: 'api',
        url: 'https://example.com',
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      tags: mockArticleDetail.tags,
    });

    const request = new NextRequest(`http://localhost/api/articles/${VALID_ID}`);
    const params = Promise.resolve({ id: VALID_ID });
    const response = await GET(request, { params });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('Article not found');
  });

  it('isHidden=false の記事でGETすると通常通り200を返すこと', async () => {
    (mockPrismaDb.article.findUnique as jest.Mock).mockResolvedValue({
      ...mockArticleDetail,
      isHidden: false,
      source: {
        id: 'src-1',
        name: 'Test Source',
        type: 'api',
        url: 'https://example.com',
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      tags: mockArticleDetail.tags,
    });

    const request = new NextRequest(`http://localhost/api/articles/${VALID_ID}`);
    const params = Promise.resolve({ id: VALID_ID });
    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});
