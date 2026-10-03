/**
 * feeds/collect の要約生成が DI の要約サービスを使うことを検証する（issue #655）
 */

const mockGenerateSummary = jest.fn();

const mockOnArticleUpdated = jest.fn();

jest.mock('@/lib/cache/cache-invalidator', () => ({
  cacheInvalidator: {
    onArticleUpdated: (...args: unknown[]) => mockOnArticleUpdated(...args),
  },
}));

jest.mock('@/lib/di/bootstrap', () => ({
  getAppDependencies: () => ({
    service: { generateSummary: mockGenerateSummary },
  }),
}));

// タグの解決（lower(name) をキーにした探索・作成。実 DB の結合テストで確かめる）
jest.mock('@/lib/services/tag-service', () => ({
  resolveTags: jest.fn(async (tags: Array<{ name: string }>) =>
    tags.map((tag) => ({ id: `tag:${tag.name}`, name: tag.name, category: null }))
  ),
}));

jest.mock('@/lib/fetchers', () => ({
  createFetcher: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { prisma } from '@/lib/prisma';
import { createFetcher } from '@/lib/fetchers';
import logger from '@/lib/logger';
import { collectFeeds } from '@/lib/services/feed-collect-service';
import { resetEnvCache } from '@/lib/config/env';

// @/lib/prisma は jest.config の moduleNameMapper で共有の prismaMock に置き換わる
const mockPrisma = prisma as unknown as {
  source: { findMany: jest.Mock };
  article: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
};

const longContent = '本文'.repeat(200); // 400 字

function setupFetchedArticle(content: string | null, tagNames: string[] = []) {
  mockPrisma.source.findMany.mockResolvedValue([
    { id: 'src-1', name: 'Source', enabled: true },
  ]);
  (createFetcher as jest.Mock).mockReturnValue({
    fetch: jest.fn().mockResolvedValue({
      articles: [
        {
          title: '記事タイトル',
          url: 'https://example.com/a',
          content,
          publishedAt: new Date('2026-10-01'),
          sourceId: 'src-1',
          tagNames,
        },
      ],
      errors: [],
    }),
  });
  mockPrisma.article.findMany.mockResolvedValue([]);
  mockPrisma.article.create.mockResolvedValue({
    id: 'art-1',
    title: '記事タイトル',
    summary: null,
    content,
  });
}

describe('collectFeeds の要約生成', () => {
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
  });

  it('DI の要約サービスで生成し、定期実行と同じく翻訳タイトルと生成時刻も保存する', async () => {
    setupFetchedArticle(longContent);
    mockGenerateSummary.mockResolvedValue({
      summary: '一覧要約',
      detailedSummary: '・詳細1\n・詳細2',
      translatedTitle: '翻訳タイトル',
      tags: ['TypeScript'],
      qualityScore: 85,
      processingTimeMs: 10,
      summaryVersion: 9,
    });

    await collectFeeds();

    expect(mockGenerateSummary).toHaveBeenCalledWith({
      title: '記事タイトル',
      content: longContent,
      qualityThreshold: 40,
      articleId: 'art-1',
    });
    expect(mockPrisma.article.update).toHaveBeenCalledWith({
      where: { id: 'art-1' },
      data: {
        summary: '一覧要約',
        detailedSummary: '・詳細1\n・詳細2',
        translatedTitle: '翻訳タイトル',
        articleType: 'unified',
        summaryVersion: 9,
        summaryComputedAt: expect.any(Date),
      },
    });
    expect(mockOnArticleUpdated).toHaveBeenCalledWith('art-1', {
      summary: '一覧要約',
      detailedSummary: '・詳細1\n・詳細2',
    });
  });

  it('本文が最小長に満たない記事は要約を生成しない', async () => {
    setupFetchedArticle('短い本文');

    const { summary } = await collectFeeds();

    expect(summary.totalCreated).toBe(1);
    expect(mockGenerateSummary).not.toHaveBeenCalled();
    expect(mockPrisma.article.update).not.toHaveBeenCalled();
  });

  it('要約生成が例外になっても記事の作成は成功として数え、要約は保存しない', async () => {
    setupFetchedArticle(longContent);
    mockGenerateSummary.mockRejectedValue(new Error('Quality too low'));

    const { results } = await collectFeeds();

    expect(results[0].newArticles).toBe(1);
    expect(results[0].success).toBe(true);
    expect(mockPrisma.article.update).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ articleId: 'art-1' }),
      'Failed to generate AI summary for article'
    );
  });

  describe('タグ付きの記事の作成（#672）', () => {
    type Tx = { article: { create: jest.Mock } };
    let tx: Tx;

    beforeEach(() => {
      // 外側の prisma と取り違えたら分かるよう、tx には別のモックを渡す
      tx = { article: { create: jest.fn() } };
      (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn(
        async (fn: (client: Tx) => unknown) => fn(tx)
      );
    });

    it('resolves tags and creates the article with their IDs in one transaction', async () => {
      setupFetchedArticle('短い', ['MCP', 'Rust']);
      tx.article.create.mockResolvedValue({
        id: 'art-1',
        title: '記事タイトル',
        summary: null,
        content: '短い',
      });
      const { resolveTags } = jest.requireMock('@/lib/services/tag-service') as {
        resolveTags: jest.Mock;
      };

      const result = await collectFeeds();

      expect(resolveTags).toHaveBeenCalledWith([{ name: 'MCP' }, { name: 'Rust' }], tx);
      expect(tx.article.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tags: { connect: [{ id: 'tag:MCP' }, { id: 'tag:Rust' }] },
          }),
        })
      );
      expect(mockPrisma.article.create).not.toHaveBeenCalled();
      expect(result.summary.totalCreated).toBe(1);
    });

    it('does not count the article when its creation fails inside the transaction', async () => {
      setupFetchedArticle('短い', ['MCP']);
      tx.article.create.mockRejectedValue(new Error('Unique constraint failed on url'));

      const result = await collectFeeds();

      expect(result.summary.totalCreated).toBe(0);
      expect(result.summary.totalErrors).toBe(1);
    });
  });
});
