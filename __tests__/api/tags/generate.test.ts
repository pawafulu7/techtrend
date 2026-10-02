/**
 * /api/tags/generate が DI の要約サービスを使い、タグを正規化して保存することを検証する（issue #655）
 */

const mockGenerateSummary = jest.fn();
const mockGetTagIdsForConnect = jest.fn();

jest.mock('@/lib/di/bootstrap', () => ({
  getAppDependencies: () => ({
    service: { generateSummary: mockGenerateSummary },
  }),
}));

// 認証・レート制限は別のテストで検証しているので、ここでは handler をそのまま通す
jest.mock('@/lib/middleware/with-cron-or-admin-auth', () => ({
  withCronOrAdminAuth: (handler: unknown) => handler,
}));
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: (_key: string, handler: unknown) => handler,
}));

jest.mock('@/lib/services/tag-service', () => ({
  getTagIdsForConnect: (...args: unknown[]) => mockGetTagIdsForConnect(...args),
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/tags/generate/route';
import { resetEnvCache } from '@/lib/config/env';

// @/lib/prisma は jest.config の moduleNameMapper で共有の prismaMock に置き換わる
const mockPrisma = prisma as unknown as {
  article: { findMany: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

const longContent = '本文'.repeat(200); // 400 字

function request() {
  return new NextRequest('http://localhost/api/tags/generate', {
    method: 'POST',
  });
}

describe('POST /api/tags/generate', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;

  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    resetEnvCache();
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }
    resetEnvCache();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTagIdsForConnect.mockResolvedValue([{ id: 'tag-1' }]);
    // トランザクションのコールバックには prisma 自身を tx として渡す
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(mockPrisma)
    );
  });

  it('DI の要約サービスで生成し、タグを getTagIdsForConnect の既定オプション（normalize: true）で接続する', async () => {
    mockPrisma.article.findMany.mockResolvedValue([
      { id: 'art-1', title: 'タイトル', content: longContent, tags: [] },
    ]);
    mockGenerateSummary.mockResolvedValue({
      summary: '一覧要約',
      detailedSummary: '・詳細',
      tags: ['js', 'React'],
      qualityScore: 80,
      processingTimeMs: 1,
      summaryVersion: 9,
    });

    const res = await POST(request());
    const body = await res.json();

    expect(mockGenerateSummary).toHaveBeenCalledWith({
      title: 'タイトル',
      content: longContent,
      qualityThreshold: 40,
      articleId: 'art-1',
    });
    // options を渡さない（= getOrCreateTags の既定 normalize: true）
    expect(mockGetTagIdsForConnect).toHaveBeenCalledWith(
      ['js', 'React'],
      undefined,
      mockPrisma
    );
    expect(mockPrisma.article.update).toHaveBeenCalledWith({
      where: { id: 'art-1' },
      data: { tags: { connect: [{ id: 'tag-1' }] } },
    });
    expect(body.data).toEqual({ generated: 1, errors: 0, total: 1 });
  });

  it('本文の短い記事を取得時に除外し、使うフィールドだけを取得する', async () => {
    mockPrisma.article.findMany.mockResolvedValue([]);

    await POST(request());

    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tags: { none: {} }, contentLength: { gte: 100 } },
        select: { id: true, title: true, content: true },
      })
    );
  });

  it('GEMINI_API_KEY が無ければ 503 を返し、記事を取得しない', async () => {
    process.env.GEMINI_API_KEY = '';
    resetEnvCache();
    try {
      const res = await POST(request());

      expect(res.status).toBe(503);
      expect(mockPrisma.article.findMany).not.toHaveBeenCalled();
    } finally {
      process.env.GEMINI_API_KEY = 'test-key';
      resetEnvCache();
    }
  });

  it('本文が最小長に満たない記事は生成せずにスキップする', async () => {
    mockPrisma.article.findMany.mockResolvedValue([
      { id: 'art-1', title: 'タイトル', content: '短い', tags: [] },
      { id: 'art-2', title: 'タイトル2', content: null, tags: [] },
    ]);

    const res = await POST(request());
    const body = await res.json();

    expect(mockGenerateSummary).not.toHaveBeenCalled();
    expect(body.data).toEqual({ generated: 0, errors: 0, total: 2 });
  });

  it('要約サービスが例外を投げた記事はエラーとして数え、次の記事に進む', async () => {
    mockPrisma.article.findMany.mockResolvedValue([
      { id: 'art-1', title: 'タイトル', content: longContent, tags: [] },
      { id: 'art-2', title: 'タイトル2', content: longContent, tags: [] },
    ]);
    mockGenerateSummary
      .mockRejectedValueOnce(new Error('Failed to generate quality summary'))
      .mockResolvedValueOnce({
        summary: '一覧要約',
        detailedSummary: '・詳細',
        tags: ['Go'],
        qualityScore: 80,
        processingTimeMs: 1,
        summaryVersion: 9,
      });

    const res = await POST(request());
    const body = await res.json();

    expect(body.data).toEqual({ generated: 1, errors: 1, total: 2 });
  });
});
