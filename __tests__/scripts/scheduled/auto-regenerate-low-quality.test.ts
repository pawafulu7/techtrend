/**
 * 低品質記事の再生成が DI の要約サービスを使い、記事スコアを保存することを検証する（issue #655）
 */

const mockGenerateSummary = jest.fn();
const mockCalculateQualityScore = jest.fn();

jest.mock('@/lib/di/bootstrap', () => ({
  getAppDependencies: () => ({
    service: { generateSummary: mockGenerateSummary },
  }),
}));

jest.mock('@/lib/utils/quality-score', () => ({
  calculateQualityScore: (...args: unknown[]) =>
    mockCalculateQualityScore(...args),
}));

jest.mock('@/scripts/scheduled/utils/regeneration-helpers', () => ({
  reportResults: jest.fn(),
  rateLimitDelay: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { prisma } from '@/lib/prisma';
import { SUMMARY_VERSION } from '@/types/article';
import { autoRegenerateLowQuality } from '@/scripts/scheduled/auto-regenerate-low-quality';

// @/lib/prisma は jest.config の moduleNameMapper で共有の prismaMock に置き換わる
const mockPrisma = prisma as unknown as {
  article: { findMany: jest.Mock; update: jest.Mock };
};

const longContent = '本文'.repeat(200); // 400 字

function lowQualityArticle(content: string | null) {
  return {
    id: 'art-1',
    title: 'タイトル',
    url: 'https://example.com/a',
    content,
    qualityScore: 40,
    summaryVersion: SUMMARY_VERSION.CURRENT - 1,
    tags: [],
    source: { name: 'Source' },
  };
}

describe('autoRegenerateLowQuality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('DI の要約サービスで生成し、サービスの summaryVersion と記事スコアを保存する', async () => {
    mockPrisma.article.findMany.mockResolvedValue([lowQualityArticle(longContent)]);
    mockGenerateSummary.mockResolvedValue({
      summary: '一覧要約',
      detailedSummary: '・詳細',
      translatedTitle: '翻訳タイトル',
      tags: [],
      qualityScore: 95, // 要約の品質スコア。保存しない
      processingTimeMs: 1,
      summaryVersion: SUMMARY_VERSION.CURRENT,
    });
    mockCalculateQualityScore.mockReturnValue(72);

    const result = await autoRegenerateLowQuality({ limit: 1 });

    expect(mockGenerateSummary).toHaveBeenCalledWith({
      title: 'タイトル',
      content: longContent,
      qualityThreshold: 40,
      articleId: 'art-1',
    });
    expect(mockCalculateQualityScore).toHaveBeenCalledWith(
      expect.objectContaining({ summary: '一覧要約', detailedSummary: '・詳細' })
    );
    expect(mockPrisma.article.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.article.update).toHaveBeenCalledWith({
      where: { id: 'art-1' },
      data: {
        summary: '一覧要約',
        detailedSummary: '・詳細',
        translatedTitle: '翻訳タイトル',
        summaryVersion: SUMMARY_VERSION.CURRENT,
        articleType: 'unified',
        qualityScore: 72,
        qualityScoreComputedAt: expect.any(Date),
      },
    });
    expect(result).toMatchObject({ succeeded: 1, failed: 0 });
  });

  it('本文が無い記事は URL を本文にせず、生成しないで失敗として数える', async () => {
    mockPrisma.article.findMany.mockResolvedValue([lowQualityArticle(null)]);

    const result = await autoRegenerateLowQuality({ limit: 1 });

    expect(mockGenerateSummary).not.toHaveBeenCalled();
    expect(mockPrisma.article.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ succeeded: 0, failed: 1 });
    expect(result.results[0].error).toContain('要約生成をスキップ');
  });

  it('要約サービスが例外を投げたら失敗として数え、記事を更新しない', async () => {
    mockPrisma.article.findMany.mockResolvedValue([lowQualityArticle(longContent)]);
    mockGenerateSummary.mockRejectedValue(
      new Error('Failed to generate quality summary after 3 attempts')
    );

    const result = await autoRegenerateLowQuality({ limit: 1 });

    expect(mockPrisma.article.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ succeeded: 0, failed: 1 });
    expect(result.results[0].error).toContain('Failed to generate quality summary');
  });
});
