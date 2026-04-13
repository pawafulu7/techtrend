import { POST } from '@/app/api/summaries/generate/route';
import { getAppDependencies } from '@/lib/di/bootstrap';
import { prisma } from '@/lib/database';
import { NextRequest } from 'next/server';

// 認証モック（ADMINセッションを返す）
jest.mock('@/lib/auth/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn().mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
        session: { id: 's1', userId: 'admin-1', token: 't1', expiresAt: new Date() },
      }),
    },
  },
}));

// withCronOrAdminAuth が getUserAuthData でロールを確認するためモック
jest.mock('@/lib/auth/user-auth-cache', () => ({
  getUserAuthData: jest.fn().mockResolvedValue({ role: 'admin', deletedAt: null }),
}));

jest.mock('@/lib/logger', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  };
  mockLogger.child.mockReturnValue(mockLogger);
  return {
    __esModule: true,
    default: mockLogger,
    logger: mockLogger,
    sanitizeError: jest.fn((e) => e),
  };
});

jest.mock('@/lib/di/bootstrap');
jest.mock('@/lib/database', () => ({
  prisma: {
    article: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock TagService (uses upsert pattern instead of createMany)
const mockGetTagIdsForConnect = jest.fn();
jest.mock('@/lib/services/tag-service', () => ({
  getTagIdsForConnect: (...args: unknown[]) => mockGetTagIdsForConnect(...args),
}));
jest.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ limit: 10, remaining: 9, reset: new Date() }),
  createRateLimiterFromConfig: jest.fn().mockReturnValue({
    consume: jest.fn().mockResolvedValue({}),
  }),
  RateLimitError: class RateLimitError extends Error {
    constructor(
      message: string,
      public limit: number,
      public remaining: number,
      public reset: Date
    ) {
      super(message);
      this.name = 'RateLimitError';
    }
  },
}));

describe('/api/summaries/generate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // withCronOrAdminAuth が auth.api.getSession を直接呼ぶため再設定
    const { auth } = require('@/lib/auth/auth');
    (auth.api.getSession as jest.Mock).mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      session: { id: 's1', userId: 'admin-1', token: 't1', expiresAt: new Date() },
    });
    // getUserAuthData: adminロール
    const { getUserAuthData } = require('@/lib/auth/user-auth-cache');
    (getUserAuthData as jest.Mock).mockResolvedValue({ role: 'admin', deletedAt: null });
  });

  it('should generate summaries with complete Prisma payload', async () => {
    const mockArticles = [{
      id: 'test-1',
      title: 'Test Article',
      content: 'Test content with enough text to generate a good summary',
      tags: []
    }];

    (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

    const mockService = {
      generateSummary: jest.fn().mockResolvedValue({
        summary: 'Test summary content',
        detailedSummary: '・Detail 1: First point\n・Detail 2: Second point',
        tags: ['test', 'typescript'],
        category: 'tech',
        translatedTitle: 'テスト記事',
        summaryVersion: 8,
        qualityScore: 85,
      })
    };

    (getAppDependencies as jest.Mock).mockReturnValue({ service: mockService });
    // TagService pattern: getTagIdsForConnect returns array of { id }
    mockGetTagIdsForConnect.mockResolvedValue([
      { id: 'tag-1' },
      { id: 'tag-2' },
    ]);
    (prisma.article.update as jest.Mock).mockResolvedValue({});

    const request = new NextRequest('http://localhost/api/summaries/generate', { method: 'POST' });
    const response = await POST(request);
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data.generated).toBe(1);
    expect(prisma.article.update).toHaveBeenCalledWith({
      where: { id: 'test-1' },
      data: expect.objectContaining({
        summary: 'Test summary content',
        detailedSummary: expect.any(String),
        articleType: 'unified',
        summaryVersion: 8,
        qualityScore: 85,
        summaryComputedAt: expect.any(Date),
        qualityScoreComputedAt: expect.any(Date),
        translatedTitle: 'テスト記事',
        category: expect.any(String),
        tags: { connect: expect.any(Array) }
      })
    });
  });

  it('should deduplicate tags within result and existing tags', async () => {
    const mockArticles = [{
      id: 'test-2',
      title: 'Test',
      content: 'content for testing tag deduplication behavior',
      tags: [{ name: 'existing' }]
    }];

    const mockService = {
      generateSummary: jest.fn().mockResolvedValue({
        summary: 'summary',
        detailedSummary: 'detailed',
        tags: ['new', 'new', 'existing'], // 重複あり
        summaryVersion: 8,
        qualityScore: 70,
      })
    };

    (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);
    (getAppDependencies as jest.Mock).mockReturnValue({ service: mockService });
    // TagService pattern: getTagIdsForConnect handles deduplication internally
    mockGetTagIdsForConnect.mockResolvedValue([{ id: 'tag-new' }]);
    (prisma.article.update as jest.Mock).mockResolvedValue({});

    const request = new NextRequest('http://localhost/api/summaries/generate', { method: 'POST' });
    await POST(request);

    // 'new'のみがTagService対象（重複除外確認）
    // TagService receives only unique new tags after filtering existing
    expect(mockGetTagIdsForConnect).toHaveBeenCalledTimes(1);
    // 第3引数はPrisma TransactionClient（tx）
    const [tags, opts, tx] = mockGetTagIdsForConnect.mock.calls[0];
    expect(tags).toEqual(['new']);
    expect(opts).toEqual({ normalize: false });
    expect(tx).toBeDefined();
  });

  it('should handle service errors gracefully', async () => {
    const mockArticles = [{
      id: 'test-3',
      title: 'Test Article',
      content: 'content',
      tags: []
    }];

    (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

    const mockService = {
      generateSummary: jest.fn().mockRejectedValue(new Error('API Error'))
    };

    (getAppDependencies as jest.Mock).mockReturnValue({ service: mockService });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const request = new NextRequest('http://localhost/api/summaries/generate', { method: 'POST' });
    const response = await POST(request);
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data.errors).toBe(1);
    expect(json.data.generated).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[API] Summary generation failed for article test-3'),
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  it('should normalize category to enum value', async () => {
    const mockArticles = [{
      id: 'test-4',
      title: 'Test',
      content: 'content for testing category normalization',
      tags: []
    }];

    const mockService = {
      generateSummary: jest.fn().mockResolvedValue({
        summary: 'summary',
        detailedSummary: 'detailed',
        tags: [],
        category: 'backend',  // normalizeArticleCategory()で'backend'に変換される
        summaryVersion: 8,
        qualityScore: 70,
      })
    };

    (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);
    (getAppDependencies as jest.Mock).mockReturnValue({ service: mockService });
    (prisma.article.update as jest.Mock).mockResolvedValue({});

    const request = new NextRequest('http://localhost/api/summaries/generate', { method: 'POST' });
    const response = await POST(request);
    const json = await response.json();

    expect(json.success).toBe(true);

    // categoryが正規化されて保存される
    const updateCall = (prisma.article.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.category).toBe('backend');
  });

  it('should handle empty tags array correctly', async () => {
    const mockArticles = [{
      id: 'test-5',
      title: 'Test',
      content: 'content for testing empty tags array handling',
      tags: []
    }];

    const mockService = {
      generateSummary: jest.fn().mockResolvedValue({
        summary: 'summary',
        detailedSummary: 'detailed',
        tags: [],
        summaryVersion: 8,
        qualityScore: 70,
      })
    };

    (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);
    (getAppDependencies as jest.Mock).mockReturnValue({ service: mockService });
    (prisma.article.update as jest.Mock).mockResolvedValue({});

    const request = new NextRequest('http://localhost/api/summaries/generate', { method: 'POST' });
    const response = await POST(request);
    const json = await response.json();

    expect(json.success).toBe(true);

    // tags: undefinedになる（スプレッド構文で条件付け）
    const updateCall = (prisma.article.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.tags).toBeUndefined();
  });

  it('should handle undefined tags from service', async () => {
    const mockArticles = [{
      id: 'test-6',
      title: 'Test',
      content: 'content for testing undefined tags handling',
      tags: []
    }];

    const mockService = {
      generateSummary: jest.fn().mockResolvedValue({
        summary: 'summary',
        detailedSummary: 'detailed',
        tags: undefined,
        summaryVersion: 8,
        qualityScore: 70,
      })
    };

    (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);
    (getAppDependencies as jest.Mock).mockReturnValue({ service: mockService });
    (prisma.article.update as jest.Mock).mockResolvedValue({});

    const request = new NextRequest('http://localhost/api/summaries/generate', { method: 'POST' });
    const response = await POST(request);
    const json = await response.json();

    expect(json.success).toBe(true);

    // tagsプロパティが存在しない（スプレッド構文で条件付け）
    const updateCall = (prisma.article.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.tags).toBeUndefined();
  });
});
