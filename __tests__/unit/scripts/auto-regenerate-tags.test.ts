/**
 * auto-regenerate.ts の applyRegeneratedArticle ヘルパーテスト
 *
 * テスト対象: applyRegeneratedArticle（summary更新 + タグdisconnect/connect + キャッシュ無効化）
 */

// --- モック定義（import より前） ---

const articleUpdate = jest.fn().mockResolvedValue({});
const articleFindUniqueOrThrow = jest.fn();

const txClient = {
  article: {
    update: articleUpdate,
    findUniqueOrThrow: articleFindUniqueOrThrow,
  },
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn((fn: (tx: typeof txClient) => Promise<void>) => fn(txClient)),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/lib/cache/cache-invalidator', () => ({
  cacheInvalidator: {
    onArticleUpdated: jest.fn().mockResolvedValue(undefined),
    onTagUpdated: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/types/article', () => ({
  SUMMARY_VERSION: { CURRENT: 3 },
}));

jest.mock('@/lib/config/env', () => ({
  env: {
    GEMINI_API_KEY: 'test-key',
    GEMINI_MODEL: 'test-model',
  },
}));

jest.mock('@/lib/utils/quality-scorer', () => ({
  calculateSummaryScore: jest.fn(),
  needsRegeneration: jest.fn(),
}));

jest.mock('@/lib/utils/content/content-extractor', () => ({
  optimizeContentForSummary: jest.fn(),
}));

jest.mock('@/lib/di/bootstrap', () => ({
  getAppDependencies: jest.fn(),
}));

jest.mock('@/lib/services/tag-service', () => ({
  getOrCreateTags: jest.fn(),
}));

jest.mock('../../../scripts/scheduled/utils/regeneration-helpers', () => ({
  reportResults: jest.fn(),
  rateLimitDelay: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('fs/promises', () => ({
  appendFile: jest.fn().mockResolvedValue(undefined),
}));

// --- import ---

import { applyRegeneratedArticle } from '@/scripts/scheduled/auto-regenerate';

// --- テスト ---

describe('auto-regenerate: disconnect-connect パターン', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // $transaction のデフォルトモックをリセット後に再設定
    const { prisma } = jest.requireMock('@/lib/prisma');
    (prisma.$transaction as jest.Mock).mockImplementation(
      (fn: (tx: typeof txClient) => Promise<void>) => fn(txClient)
    );
  });

  describe('1. disconnect-connect パターンの正しさ', () => {
    it('旧タグ[id:1, id:2]を disconnect し、新タグ[id:3, id:4]を connect すること', async () => {
      // Arrange
      (articleFindUniqueOrThrow as jest.Mock).mockResolvedValue({
        tags: [{ id: '1' }, { id: '2' }],
      });

      // Act
      await applyRegeneratedArticle(
        'article-dc',
        {
          summary: 'テスト要約',
          detailedSummary: '・詳細',
          translatedTitle: 'Test Article',
          articleType: 'tech',
        },
        [{ id: '3' }, { id: '4' }]
      );

      // Assert: summary更新(1回目) + disconnect(2回目) + connect(3回目)
      expect(articleUpdate).toHaveBeenCalledTimes(3);

      // 1回目: summary更新
      expect(articleUpdate).toHaveBeenNthCalledWith(1, {
        where: { id: 'article-dc' },
        data: expect.objectContaining({ summary: 'テスト要約' }),
      });

      // 2回目: disconnect
      expect(articleUpdate).toHaveBeenNthCalledWith(2, {
        where: { id: 'article-dc' },
        data: { tags: { disconnect: [{ id: '1' }, { id: '2' }] } },
      });

      // 3回目: connect
      expect(articleUpdate).toHaveBeenNthCalledWith(3, {
        where: { id: 'article-dc' },
        data: { tags: { connect: [{ id: '3' }, { id: '4' }] } },
      });
    });

    it('旧タグがない場合は disconnect をスキップし、connect のみ呼び出すこと', async () => {
      // Arrange: 旧タグ空
      (articleFindUniqueOrThrow as jest.Mock).mockResolvedValue({ tags: [] });

      // Act
      await applyRegeneratedArticle(
        'article-no-old',
        { summary: 'テスト要約', detailedSummary: '・詳細', translatedTitle: null, articleType: null },
        [{ id: '3' }]
      );

      // Assert: summary更新(1回目) + connect(2回目)。disconnectなし
      expect(articleUpdate).toHaveBeenCalledTimes(2);
      expect(articleUpdate).toHaveBeenNthCalledWith(2, {
        where: { id: 'article-no-old' },
        data: { tags: { connect: [{ id: '3' }] } },
      });
      // disconnect が含まれていないことを確認
      const calls = (articleUpdate as jest.Mock).mock.calls;
      const hasDisconnect = calls.some((c: any[]) => c[0]?.data?.tags?.disconnect !== undefined);
      expect(hasDisconnect).toBe(false);
    });

    it('新タグがない場合は connect をスキップし、disconnect のみ呼び出すこと', async () => {
      // Arrange: 旧タグあり
      (articleFindUniqueOrThrow as jest.Mock).mockResolvedValue({
        tags: [{ id: '1' }],
      });

      // Act
      await applyRegeneratedArticle(
        'article-no-new',
        { summary: 'テスト要約', detailedSummary: null, translatedTitle: null, articleType: null },
        []
      );

      // Assert: summary更新(1回目) + disconnect(2回目)。connectなし
      expect(articleUpdate).toHaveBeenCalledTimes(2);
      expect(articleUpdate).toHaveBeenNthCalledWith(2, {
        where: { id: 'article-no-new' },
        data: { tags: { disconnect: [{ id: '1' }] } },
      });
      // connect が含まれていないことを確認
      const calls = (articleUpdate as jest.Mock).mock.calls;
      const hasConnect = calls.some((c: any[]) => c[0]?.data?.tags?.connect !== undefined);
      expect(hasConnect).toBe(false);
    });
  });

  describe('2. キャッシュ無効化', () => {
    it('onArticleUpdated と onTagUpdated が両方呼ばれること', async () => {
      (articleFindUniqueOrThrow as jest.Mock).mockResolvedValue({ tags: [] });
      const { cacheInvalidator } = jest.requireMock('@/lib/cache/cache-invalidator');

      await applyRegeneratedArticle(
        'article-cache',
        { summary: 'テスト要約', detailedSummary: '・詳細', translatedTitle: null, articleType: null },
        []
      );

      expect(cacheInvalidator.onArticleUpdated).toHaveBeenCalledWith(
        'article-cache',
        { summary: 'テスト要約', detailedSummary: '・詳細' }
      );
      expect(cacheInvalidator.onTagUpdated).toHaveBeenCalledTimes(1);
    });

    it('キャッシュ無効化エラー時も例外が外に漏れないこと', async () => {
      (articleFindUniqueOrThrow as jest.Mock).mockResolvedValue({ tags: [] });
      const { cacheInvalidator } = jest.requireMock('@/lib/cache/cache-invalidator');
      (cacheInvalidator.onArticleUpdated as jest.Mock).mockRejectedValueOnce(new Error('redis down'));

      // エラーが外に漏れないことを確認（applyRegeneratedArticle内でcatchされる）
      await expect(
        applyRegeneratedArticle(
          'article-cache-err',
          { summary: 'テスト要約', detailedSummary: null, translatedTitle: null, articleType: null },
          []
        )
      ).resolves.toBeUndefined();
    });

    it('detailedSummary が null の場合は onArticleUpdated に undefined が渡されること', async () => {
      (articleFindUniqueOrThrow as jest.Mock).mockResolvedValue({ tags: [] });
      const { cacheInvalidator } = jest.requireMock('@/lib/cache/cache-invalidator');

      await applyRegeneratedArticle(
        'article-null-detail',
        { summary: 'テスト要約', detailedSummary: null, translatedTitle: null, articleType: null },
        []
      );

      expect(cacheInvalidator.onArticleUpdated).toHaveBeenCalledWith(
        'article-null-detail',
        { summary: 'テスト要約', detailedSummary: undefined }
      );
    });
  });

  describe('3. 実行順序の検証', () => {
    it('summary更新 → findUniqueOrThrow → disconnect → connect の順で実行されること', async () => {
      const callOrder: string[] = [];

      (articleFindUniqueOrThrow as jest.Mock).mockImplementation(async () => {
        callOrder.push('findUniqueOrThrow');
        return { tags: [{ id: '1' }] };
      });

      (articleUpdate as jest.Mock).mockImplementation(async (args: { data: { tags?: { disconnect?: unknown; connect?: unknown }; summary?: string } }) => {
        if (args.data.tags && 'disconnect' in args.data.tags) {
          callOrder.push('disconnect');
        } else if (args.data.tags && 'connect' in args.data.tags) {
          callOrder.push('connect');
        } else {
          callOrder.push('summary-update');
        }
        return {};
      });

      await applyRegeneratedArticle(
        'article-order',
        { summary: 'テスト要約', detailedSummary: null, translatedTitle: null, articleType: null },
        [{ id: '2' }]
      );

      // summary-update → findUniqueOrThrow → disconnect → connect の順
      expect(callOrder).toEqual(['summary-update', 'findUniqueOrThrow', 'disconnect', 'connect']);
    });
  });
});
