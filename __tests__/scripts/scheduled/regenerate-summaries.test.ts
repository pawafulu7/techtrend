/**
 * 問題のある要約の再生成（scripts/scheduled/regenerate-summaries.ts）が、対象を正しく選び、
 * 生成した形式の版で保存してから埋め込みのジョブを積むことを検証する（issue #819）
 */

const mockGenerateDetailedSummary = jest.fn();
const mockEnqueue = jest.fn();
const mockRateLimitDelay = jest.fn();
const mockOnArticleUpdated = jest.fn();
const mockCloseRedisConnection = jest.fn();

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

jest.mock('@/lib/cache/cache-invalidator', () => ({
  cacheInvalidator: {
    onArticleUpdated: (...args: unknown[]) => mockOnArticleUpdated(...args),
  },
}));

// next/jest の SWC は '@/...' の import を相対パスに書き換えるので、moduleNameMapper のモック
// （__mocks__/lib/redis/client.ts）は使われない。実装ファイルを相対パスでモックする（cli.test.ts と同じ）
jest.mock('../../../lib/redis/client', () => ({
  closeRedisConnection: () => mockCloseRedisConnection(),
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
    mockOnArticleUpdated.mockResolvedValue(undefined);
    mockCloseRedisConnection.mockResolvedValue(undefined);
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

  it('生成した形式（統一プロンプト）の版と、定期実行と同じ状態で保存し、保存の後にジョブを積んでキャッシュを消す', async () => {
    mockPrisma.article.findMany.mockResolvedValue([article]);

    await regenerateSummaries({ articleIds: ['art-1'] });

    expect(mockPrisma.article.update).toHaveBeenCalledTimes(1);
    const { where, data } = mockPrisma.article.update.mock.calls[0][0];
    expect(where).toEqual({ id: 'art-1' });
    expect(data).toEqual(
      expect.objectContaining({
        summaryVersion: SUMMARY_VERSION.V8,
        // 一覧は summaryComputedAt がある記事だけを出す
        summaryComputedAt: expect.any(Date),
        summaryError: null,
        skipReason: null,
      })
    );
    expect(mockEnqueue).toHaveBeenCalledWith('art-1');
    expect(mockEnqueue.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockPrisma.article.update.mock.invocationCallOrder[0]
    );
    expect(mockOnArticleUpdated).toHaveBeenCalledWith('art-1', {
      summary: data.summary,
      detailedSummary: data.detailedSummary,
    });
    expect(mockOnArticleUpdated.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockEnqueue.mock.invocationCallOrder[0]
    );
    // キャッシュのモジュールが開いた Redis の接続を閉じる（閉じないとプロセスが終わらない）
    expect(mockCloseRedisConnection).toHaveBeenCalledTimes(1);
  });

  it('新しいタグを書いてからキャッシュを消す', async () => {
    const { resolveTags } = jest.requireMock('@/lib/services/tag-service') as {
      resolveTags: jest.Mock;
    };
    resolveTags.mockResolvedValueOnce([{ id: 'tag-1', name: 'TypeScript' }]);
    mockGenerateDetailedSummary.mockResolvedValue({
      summary: '新しい一覧要約です。',
      detailedSummary: '・要点: 新しい詳細要約です。',
      tags: ['TypeScript'],
    });
    mockPrisma.article.findMany.mockResolvedValue([article]);

    await regenerateSummaries({ articleIds: ['art-1'] });

    // 要約の保存とタグの保存
    expect(mockPrisma.article.update).toHaveBeenCalledTimes(2);
    expect(mockPrisma.article.update.mock.calls[1][0].data).toEqual({
      tags: { connect: [{ id: 'tag-1' }] },
    });
    expect(mockOnArticleUpdated.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockPrisma.article.update.mock.invocationCallOrder[1]
    );
  });

  it('生成に失敗した記事は保存せず、ジョブも積まない', async () => {
    mockPrisma.article.findMany.mockResolvedValue([article]);
    mockGenerateDetailedSummary.mockRejectedValue(new Error('API error'));

    await regenerateSummaries({ articleIds: ['art-1'] });

    expect(mockPrisma.article.update).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('本文が短い記事は生成も保存もせず、ジョブも積まない', async () => {
    mockPrisma.article.findMany.mockResolvedValue([
      { ...article, content: '短い本文', summary: null },
    ]);

    await regenerateSummaries({ articleIds: ['art-1'] });

    expect(mockGenerateDetailedSummary).not.toHaveBeenCalled();
    expect(mockPrisma.article.update).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('既定の対象は、今の版より前の要約に絞り、短い要約は SQL で選んだ ID で加える', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'short-1' }, { id: 'short-2' }]);
    mockPrisma.article.findMany.mockResolvedValue([]);

    await regenerateSummaries({ limit: 10 });

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = mockPrisma.$queryRaw.mock.calls[0];
    const sql = strings.join('?');
    expect(sql).toContain('char_length(summary) < 50');
    expect(sql).toContain('char_length("detailedSummary") < 200');
    // 下の取得と同じ絞り込み（要約がある・今の版より前）を LIMIT の前に掛ける
    expect(sql).toContain(`COALESCE(summary, '') <> ''`);
    expect(sql).toContain('"summaryVersion" <');
    // 下の取得と同じ並びで take 件までに絞る（同じ日時は id で決める）
    expect(sql).toContain('ORDER BY "createdAt" DESC, id DESC');
    expect(values).toContain(SUMMARY_VERSION.CURRENT);
    expect(values).toContain(10);

    const { where, take, orderBy } = mockPrisma.article.findMany.mock.calls[0][0];
    expect(take).toBe(10);
    expect(orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    // 統一プロンプト（V8）で作るので、今の版の要約は版を下げないよう対象にしない
    expect(where.summary).toEqual({ not: null, notIn: [''] });
    expect(where.summaryVersion).toEqual({ lt: SUMMARY_VERSION.CURRENT });
    // quality-check.ts が再生成の印として版を 0 に戻した記事
    expect(where.OR).toContainEqual({ summaryVersion: 0 });
    expect(where.OR).toContainEqual({ id: { in: ['short-1', 'short-2'] } });
    // 文字列の lt に数値を渡すと、Prisma の検証エラーで取得ごと落ちる
    for (const condition of where.OR) {
      for (const filter of Object.values(condition)) {
        if (filter && typeof filter === 'object') {
          expect(filter).not.toHaveProperty('lt');
        }
      }
    }
  });

  it('--limit が正の数でなければ、既定の 50 件にする', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.article.findMany.mockResolvedValue([]);

    await regenerateSummaries({ limit: -5 });

    expect(mockPrisma.article.findMany.mock.calls[0][0].take).toBe(50);
  });

  it('--force では文字数でも版でも選ばず、条件なしで取得する', async () => {
    mockPrisma.article.findMany.mockResolvedValue([]);

    await regenerateSummaries({ force: true });

    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(mockPrisma.article.findMany.mock.calls[0][0].where).toEqual({});
  });
});
