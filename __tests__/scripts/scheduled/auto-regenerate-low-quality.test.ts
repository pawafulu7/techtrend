/**
 * 低品質記事の再生成が DI の要約サービスを使い、記事スコアを保存することを検証する（issue #655）
 */

const mockGenerateSummary = jest.fn();
const mockCalculateArticleQualityScore = jest.fn();
const mockOnArticleUpdated = jest.fn();
const mockRateLimitDelay = jest.fn();

jest.mock('@/lib/di/bootstrap', () => ({
  getAppDependencies: () => ({
    service: { generateSummary: mockGenerateSummary },
  }),
}));

jest.mock('@/lib/utils/quality-score', () => ({
  calculateArticleQualityScore: (...args: unknown[]) =>
    mockCalculateArticleQualityScore(...args),
}));

jest.mock('@/lib/cache/cache-invalidator', () => ({
  cacheInvalidator: {
    onArticleUpdated: (...args: unknown[]) => mockOnArticleUpdated(...args),
  },
}));

jest.mock('@/scripts/scheduled/utils/regeneration-helpers', () => ({
  reportResults: jest.fn(),
  rateLimitDelay: (...args: unknown[]) => mockRateLimitDelay(...args),
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { prisma } from '@/lib/prisma';
import { resetEnvCache } from '@/lib/config/env';
import { SUMMARY_VERSION } from '@/types/article';
import { autoRegenerateLowQuality } from '@/scripts/scheduled/auto-regenerate-low-quality';

// @/lib/prisma は jest.config の moduleNameMapper で共有の prismaMock に置き換わる
const mockPrisma = prisma as unknown as {
  article: { findMany: jest.Mock; update: jest.Mock };
  $disconnect: jest.Mock;
};

const longContent = '本文'.repeat(200); // 400 字

function lowQualityArticle(content: string | null, id = 'art-1') {
  return {
    id,
    title: 'タイトル',
    url: 'https://example.com/a',
    content,
    qualityScore: 40,
    summaryVersion: SUMMARY_VERSION.CURRENT - 1,
    tags: [],
    source: { name: 'Source' },
  };
}

const serviceResult = {
  summary: '一覧要約',
  detailedSummary: '・詳細',
  translatedTitle: '翻訳タイトル',
  tags: [],
  qualityScore: 95, // 要約の品質スコア。保存しない
  processingTimeMs: 1,
  summaryVersion: SUMMARY_VERSION.CURRENT,
};

describe('autoRegenerateLowQuality', () => {
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
    mockRateLimitDelay.mockResolvedValue(undefined);
    mockOnArticleUpdated.mockResolvedValue(undefined);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('DI の要約サービスで生成し、定期実行と同じ状態フィールドと記事スコアを保存する', async () => {
    mockPrisma.article.findMany.mockResolvedValue([lowQualityArticle(longContent)]);
    mockGenerateSummary.mockResolvedValue(serviceResult);
    mockCalculateArticleQualityScore.mockReturnValue(72);

    const result = await autoRegenerateLowQuality({ limit: 1 });

    expect(mockGenerateSummary).toHaveBeenCalledWith({
      title: 'タイトル',
      content: longContent,
      qualityThreshold: 40,
      articleId: 'art-1',
    });
    expect(mockCalculateArticleQualityScore).toHaveBeenCalledWith(
      expect.objectContaining({ summary: '一覧要約', detailedSummary: '・詳細' })
    );
    expect(mockPrisma.article.update).toHaveBeenCalledTimes(1);
    const { data } = mockPrisma.article.update.mock.calls[0][0];
    expect(data).toEqual({
      summary: '一覧要約',
      detailedSummary: '・詳細',
      translatedTitle: '翻訳タイトル',
      summaryVersion: SUMMARY_VERSION.CURRENT,
      articleType: 'unified',
      summaryComputedAt: expect.any(Date),
      summaryError: null,
      skipReason: null,
      qualityScore: 72,
      qualityScoreComputedAt: expect.any(Date),
    });
    expect(data.summaryComputedAt).toBe(data.qualityScoreComputedAt);
    expect(mockOnArticleUpdated).toHaveBeenCalledWith('art-1', {
      summary: '一覧要約',
      detailedSummary: '・詳細',
    });
    expect(result).toMatchObject({ succeeded: 1, failed: 0 });
  });

  it('取得時に本文の短い記事を除外し、エンリッチメント優先を切っても limit 件に絞る', async () => {
    mockPrisma.article.findMany.mockResolvedValue([
      lowQualityArticle(longContent, 'art-1'),
      lowQualityArticle(longContent, 'art-2'),
    ]);
    mockGenerateSummary.mockResolvedValue(serviceResult);
    mockCalculateArticleQualityScore.mockReturnValue(72);

    const result = await autoRegenerateLowQuality({
      limit: 1,
      priorityEnriched: false,
    });

    expect(mockPrisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ contentLength: { gte: 100 } }),
        take: 2,
      })
    );
    expect(result.totalProcessed).toBe(1);
    expect(mockGenerateSummary).toHaveBeenCalledTimes(1);
  });

  it('本文が空白だけの記事は URL を本文にせず、生成しないで失敗として数える', async () => {
    mockPrisma.article.findMany.mockResolvedValue([
      lowQualityArticle(' '.repeat(200)),
    ]);

    const result = await autoRegenerateLowQuality({ limit: 1 });

    expect(mockGenerateSummary).not.toHaveBeenCalled();
    expect(mockPrisma.article.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ succeeded: 0, failed: 1 });
    expect(result.results[0].error).toContain('要約生成をスキップ');
  });

  it('要約サービスが例外を投げたら失敗として数え、記事を更新しない', async () => {
    mockPrisma.article.findMany.mockResolvedValue([lowQualityArticle(longContent)]);
    mockGenerateSummary.mockRejectedValue(
      new Error('Failed to generate quality summary after 3 attempts: Quality too low')
    );

    const result = await autoRegenerateLowQuality({ limit: 1 });

    expect(mockPrisma.article.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ succeeded: 0, failed: 1 });
    expect(result.results[0].error).toContain('Failed to generate quality summary');
    expect(mockRateLimitDelay).not.toHaveBeenCalledWith(60000);
  });

  it.each([
    [
      '包まれた 429',
      'Failed to generate quality summary after 3 attempts: Retryable error during summarization: HTTP 429: Resource exhausted',
    ],
    [
      'サーキットブレーカー',
      'Failed to generate quality summary after 3 attempts: Fatal error during summarization: Circuit breaker is open (tier: standard)',
    ],
  ])('%s で失敗したら 60 秒待つ', async (_label, message) => {
    mockPrisma.article.findMany.mockResolvedValue([lowQualityArticle(longContent)]);
    mockGenerateSummary.mockRejectedValue(new Error(message));

    await autoRegenerateLowQuality({ limit: 1 });

    expect(mockRateLimitDelay).toHaveBeenCalledWith(60000);
  });

  it('GEMINI_API_KEY が無ければ記事を取得せずに失敗を返す', async () => {
    process.env.GEMINI_API_KEY = '';
    resetEnvCache();
    try {
      const result = await autoRegenerateLowQuality({ limit: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('GEMINI_API_KEY is not set');
      expect(mockPrisma.article.findMany).not.toHaveBeenCalled();
    } finally {
      process.env.GEMINI_API_KEY = 'test-key';
      resetEnvCache();
    }
  });

  it('関数自体は共有の prisma クライアントを切断しない', async () => {
    mockPrisma.article.findMany.mockResolvedValue([]);

    await autoRegenerateLowQuality({ limit: 1 });

    expect(mockPrisma.$disconnect).not.toHaveBeenCalled();
  });
});
