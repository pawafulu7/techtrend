/**
 * 問題のある要約の再生成（scripts/scheduled/regenerate-summaries.ts）が、対象を正しく選び、
 * 生成した形式の版で保存してから埋め込みのジョブを積むことを検証する（issue #819）
 */

const mockGenerateDetailedSummary = jest.fn();
const mockEnqueue = jest.fn();
const mockRateLimitDelay = jest.fn();

jest.mock('@/lib/ai/gemini', () => ({
  GeminiClient: class {
    generateDetailedSummary = (...args: unknown[]) =>
      mockGenerateDetailedSummary(...args);
  },
}));

// ジョブの行の作り方は embedding-scheduler の単体テストで確かめる
jest.mock('@/lib/services/embedding-scheduler', () => ({
  EmbeddingScheduler: class {
    enqueue = (...args: unknown[]) => mockEnqueue(...args);
  },
}));

jest.mock('@/scripts/scheduled/utils/regeneration-helpers', () => ({
  reportResults: jest.fn(),
  rateLimitDelay: (...args: unknown[]) => mockRateLimitDelay(...args),
}));

jest.mock('@/lib/services/tag-service', () => ({
  resolveTags: jest.fn(async () => []),
}));

import { prisma } from '@/lib/prisma';
import { resetEnvCache } from '@/lib/config/env';
import { SUMMARY_VERSION } from '@/types/article';
import { regenerateSummaries } from '@/scripts/scheduled/regenerate-summaries';

// @/lib/prisma は jest.config の moduleNameMapper で共有の prismaMock に置き換わる
const mockPrisma = prisma as unknown as {
  $queryRaw: jest.Mock;
  article: { findMany: jest.Mock; update: jest.Mock };
};

const article = {
  id: 'art-1',
  title: 'タイトル',
  content: '本文'.repeat(100),
  summary: '短い要約',
  tags: [],
  source: { name: 'Source' },
};

describe('regenerateSummaries', () => {
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
    mockGenerateDetailedSummary.mockResolvedValue({
      summary: '新しい一覧要約です。',
      detailedSummary: '・要点: 新しい詳細要約です。',
      tags: [],
    });
    mockPrisma.article.update.mockResolvedValue({});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('生成した形式（統一プロンプト）の版で保存し、保存の後に埋め込みのジョブを積む', async () => {
    mockPrisma.article.findMany.mockResolvedValue([article]);

    await regenerateSummaries({ articleIds: ['art-1'] });

    expect(mockPrisma.article.update).toHaveBeenCalledTimes(1);
    const { where, data } = mockPrisma.article.update.mock.calls[0][0];
    expect(where).toEqual({ id: 'art-1' });
    expect(data.summaryVersion).toBe(SUMMARY_VERSION.V8);
    expect(mockEnqueue).toHaveBeenCalledWith('art-1');
    expect(mockEnqueue.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockPrisma.article.update.mock.invocationCallOrder[0]
    );
  });

  it('生成に失敗した記事は保存せず、ジョブも積まない', async () => {
    mockPrisma.article.findMany.mockResolvedValue([article]);
    mockGenerateDetailedSummary.mockRejectedValue(new Error('API error'));

    await regenerateSummaries({ articleIds: ['art-1'] });

    expect(mockPrisma.article.update).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('既定の対象には、要約・詳細要約が短い記事を SQL で選んだ ID で加える', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'short-1' }, { id: 'short-2' }]);
    mockPrisma.article.findMany.mockResolvedValue([]);

    await regenerateSummaries({ limit: 10 });

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = mockPrisma.$queryRaw.mock.calls[0];
    expect(strings.join('?')).toContain('char_length(summary) < 50');
    expect(strings.join('?')).toContain('char_length("detailedSummary") < 200');
    // 下の取得と同じ件数までに絞る
    expect(values).toContain(10);

    const { where, take } = mockPrisma.article.findMany.mock.calls[0][0];
    expect(take).toBe(10);
    expect(where.OR).toContainEqual({ id: { in: ['short-1', 'short-2'] } });
    // 文字列の lt に数値を渡すと、Prisma の検証エラーで取得ごと落ちる
    for (const condition of where.OR) {
      const filter = Object.values(condition)[0];
      if (filter && typeof filter === 'object') {
        expect(filter).not.toHaveProperty('lt');
      }
    }
  });

  it('--force では文字数で選ばず、条件なしで取得する', async () => {
    mockPrisma.article.findMany.mockResolvedValue([]);

    await regenerateSummaries({ force: true });

    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(mockPrisma.article.findMany.mock.calls[0][0].where).toEqual({});
  });
});
