/**
 * auto-regenerate.ts の applyRegeneratedArticle ヘルパーテスト
 *
 * テスト対象: applyRegeneratedArticle（summary更新 + タグdisconnect/connect + キャッシュ無効化）
 */

// --- モック定義（import より前） ---
// NOTE: jest.mock ファクトリはホイストされるため、ファクトリ内で参照する変数は
//       "mock" プレフィックス付きにする必要がある（Jestのホイスティング制約）。
//       テストからは jest.requireMock 経由でアクセスする。

jest.mock('@/lib/prisma', () => {
  const mockArticleUpdate = jest.fn().mockResolvedValue({});
  const mockArticleFindUniqueOrThrow = jest.fn().mockResolvedValue({ tags: [] });

  const mockTxClient = {
    article: {
      update: mockArticleUpdate,
      findUniqueOrThrow: mockArticleFindUniqueOrThrow,
    },
  };

  return {
    prisma: {
      $transaction: jest.fn((fn: (tx: typeof mockTxClient) => Promise<void>) =>
        fn(mockTxClient)
      ),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      __mockTxClient: mockTxClient,
    },
  };
});

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

// --- ヘルパー: モックアクセサ ---

function getPrisma() {
  return jest.requireMock('@/lib/prisma').prisma as {
    $transaction: jest.Mock;
    __mockTxClient: {
      article: {
        update: jest.Mock;
        findUniqueOrThrow: jest.Mock;
      };
    };
  };
}

function getCacheInvalidator() {
  return jest.requireMock('@/lib/cache/cache-invalidator').cacheInvalidator as {
    onArticleUpdated: jest.Mock;
    onTagUpdated: jest.Mock;
  };
}

// --- テスト ---

describe('auto-regenerate: disconnect-connect パターン', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // clearAllMocks 後に $transaction の実装を復元
    const { prisma } = jest.requireMock('@/lib/prisma');
    const txClient = prisma.__mockTxClient;
    (prisma.$transaction as jest.Mock).mockImplementation(
      (fn: (tx: typeof txClient) => Promise<void>) => fn(txClient)
    );

    // findUniqueOrThrow のデフォルト戻り値を復元（clearAllMocks でリセットされるため）
    (txClient.article.findUniqueOrThrow as jest.Mock).mockResolvedValue({ tags: [] });
  });

  describe('1. disconnect-connect パターンの正しさ', () => {
    it('旧タグ[id:1, id:2]を disconnect し、新タグ[id:3, id:4]を connect すること', async () => {
      // Arrange
      const { __mockTxClient: txClient } = getPrisma();
      (txClient.article.findUniqueOrThrow as jest.Mock).mockResolvedValue({
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
      const articleUpdate = txClient.article.update;
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
      // Arrange: 旧タグ空（beforeEach のデフォルトが { tags: [] } なので追加設定不要）
      const { __mockTxClient: txClient } = getPrisma();

      // Act
      await applyRegeneratedArticle(
        'article-no-old',
        { summary: 'テスト要約', detailedSummary: '・詳細', translatedTitle: null, articleType: null },
        [{ id: '3' }]
      );

      // Assert: summary更新(1回目) + connect(2回目)。disconnectなし
      const articleUpdate = txClient.article.update;
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
      const { __mockTxClient: txClient } = getPrisma();
      (txClient.article.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        tags: [{ id: '1' }],
      });

      // Act
      await applyRegeneratedArticle(
        'article-no-new',
        { summary: 'テスト要約', detailedSummary: null, translatedTitle: null, articleType: null },
        []
      );

      // Assert: summary更新(1回目) + disconnect(2回目)。connectなし
      const articleUpdate = txClient.article.update;
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
      const cacheInvalidator = getCacheInvalidator();

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
      const cacheInvalidator = getCacheInvalidator();
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
      const cacheInvalidator = getCacheInvalidator();

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
      const { __mockTxClient: txClient } = getPrisma();
      const callOrder: string[] = [];

      (txClient.article.findUniqueOrThrow as jest.Mock).mockImplementation(async () => {
        callOrder.push('findUniqueOrThrow');
        return { tags: [{ id: '1' }] };
      });

      (txClient.article.update as jest.Mock).mockImplementation(
        async (args: { data: { tags?: { disconnect?: unknown; connect?: unknown }; summary?: string } }) => {
          if (args.data.tags && 'disconnect' in args.data.tags) {
            callOrder.push('disconnect');
          } else if (args.data.tags && 'connect' in args.data.tags) {
            callOrder.push('connect');
          } else {
            callOrder.push('summary-update');
          }
          return {};
        }
      );

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
