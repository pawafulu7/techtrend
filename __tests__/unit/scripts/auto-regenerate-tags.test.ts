/**
 * auto-regenerate.ts の applyRegeneratedArticle ヘルパーテスト
 *
 * テスト対象: applyRegeneratedArticle（summary更新 + タグdisconnect/connect + キャッシュ無効化）
 *
 * prisma は jest.config.node.js の moduleNameMapper により
 * __mocks__/lib/prisma.ts → test/utils/prisma-mock.js (jest-mock-extended mockDeep) が使われる。
 * $transaction は setupDefaultTransactionMock により operations(prismaMock) を実行するため、
 * tx === prismaMock となる。各テストでは prismaMock.article.* を直接設定する。
 */

// --- モック定義（import より前） ---

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
import { getOrCreateTags } from '@/lib/services/tag-service';
const { prismaMock } = require('../../../test/utils/prisma-mock');

const mockGetOrCreateTags = getOrCreateTags as jest.MockedFunction<typeof getOrCreateTags>;

// --- ヘルパー ---

function getCacheInvalidator() {
  return jest.requireMock('@/lib/cache/cache-invalidator').cacheInvalidator as {
    onArticleUpdated: jest.Mock;
    onTagUpdated: jest.Mock;
  };
}

// --- テスト ---

describe('auto-regenerate: disconnect-connect パターン', () => {
  // jest.setup.node.js の beforeEach で resetPrismaMock() が呼ばれるため、
  // 各テストで必要なモックを設定するだけでよい。
  // $transaction は setupDefaultTransactionMock により operations(prismaMock) を実行 → tx === prismaMock

  beforeEach(() => {
    const { cacheInvalidator } = jest.requireMock('@/lib/cache/cache-invalidator');
    (cacheInvalidator.onArticleUpdated as jest.Mock).mockClear().mockResolvedValue(undefined);
    (cacheInvalidator.onTagUpdated as jest.Mock).mockClear().mockResolvedValue(undefined);
  });

  describe('1. disconnect-connect パターンの正しさ', () => {
    it('旧タグ[id:1, id:2]を disconnect し、新タグ[id:3, id:4]を connect すること', async () => {
      // Arrange: トランザクション内の findUniqueOrThrow が旧タグを返す
      prismaMock.article.findUniqueOrThrow.mockResolvedValue({
        tags: [{ id: '1' }, { id: '2' }],
      });

      // getOrCreateTags がtx内で呼ばれ、Tagレコードを返す
      mockGetOrCreateTags.mockResolvedValueOnce([
        { id: '3', name: 'tag-c', category: null, createdAt: new Date(), updatedAt: new Date() },
        { id: '4', name: 'tag-d', category: null, createdAt: new Date(), updatedAt: new Date() },
      ] as any);

      // Act
      await applyRegeneratedArticle(
        'article-dc',
        {
          summary: 'テスト要約',
          detailedSummary: '・詳細',
          translatedTitle: 'Test Article',
          articleType: 'tech',
        },
        ['tag-c', 'tag-d']
      );

      // Assert: summary更新(1回目) + disconnect(2回目) + connect(3回目)
      expect(prismaMock.article.update).toHaveBeenCalledTimes(3);

      // 1回目: summary更新
      expect(prismaMock.article.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'article-dc' },
        data: expect.objectContaining({ summary: 'テスト要約' }),
      });

      // 2回目: disconnect
      expect(prismaMock.article.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'article-dc' },
        data: { tags: { disconnect: [{ id: '1' }, { id: '2' }] } },
      });

      // 3回目: connect
      expect(prismaMock.article.update).toHaveBeenNthCalledWith(3, {
        where: { id: 'article-dc' },
        data: { tags: { connect: [{ id: '3' }, { id: '4' }] } },
      });
    });

    it('旧タグがない場合は disconnect をスキップし、connect のみ呼び出すこと', async () => {
      // Arrange: 旧タグ空
      prismaMock.article.findUniqueOrThrow.mockResolvedValue({ tags: [] });

      mockGetOrCreateTags.mockResolvedValueOnce([
        { id: '3', name: 'tag-c', category: null, createdAt: new Date(), updatedAt: new Date() },
      ] as any);

      // Act
      await applyRegeneratedArticle(
        'article-no-old',
        { summary: 'テスト要約', detailedSummary: '・詳細', translatedTitle: null, articleType: null },
        ['tag-c']
      );

      // Assert: summary更新(1回目) + connect(2回目)。disconnectなし
      expect(prismaMock.article.update).toHaveBeenCalledTimes(2);
      expect(prismaMock.article.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'article-no-old' },
        data: { tags: { connect: [{ id: '3' }] } },
      });
      // disconnect が含まれていないことを確認
      const calls: any[][] = prismaMock.article.update.mock.calls;
      const hasDisconnect = calls.some((c) => c[0]?.data?.tags?.disconnect !== undefined);
      expect(hasDisconnect).toBe(false);
    });

    it('新タグがない場合は connect をスキップし、disconnect のみ呼び出すこと', async () => {
      // Arrange: 旧タグあり
      prismaMock.article.findUniqueOrThrow.mockResolvedValue({
        tags: [{ id: '1' }],
      });

      mockGetOrCreateTags.mockResolvedValueOnce([] as any);

      // Act
      await applyRegeneratedArticle(
        'article-no-new',
        { summary: 'テスト要約', detailedSummary: null, translatedTitle: null, articleType: null },
        []
      );

      // Assert: summary更新(1回目) + disconnect(2回目)。connectなし
      expect(prismaMock.article.update).toHaveBeenCalledTimes(2);
      expect(prismaMock.article.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'article-no-new' },
        data: { tags: { disconnect: [{ id: '1' }] } },
      });
      // connect が含まれていないことを確認
      const calls: any[][] = prismaMock.article.update.mock.calls;
      const hasConnect = calls.some((c) => c[0]?.data?.tags?.connect !== undefined);
      expect(hasConnect).toBe(false);
    });
  });

  describe('2. キャッシュ無効化', () => {
    it('onArticleUpdated と onTagUpdated が両方呼ばれること', async () => {
      prismaMock.article.findUniqueOrThrow.mockResolvedValue({ tags: [] });
      mockGetOrCreateTags.mockResolvedValueOnce([] as any);
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
      prismaMock.article.findUniqueOrThrow.mockResolvedValue({ tags: [] });
      const cacheInvalidator = getCacheInvalidator();
      (cacheInvalidator.onArticleUpdated as jest.Mock).mockRejectedValueOnce(new Error('redis down'));

      mockGetOrCreateTags.mockResolvedValueOnce([] as any);

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
      prismaMock.article.findUniqueOrThrow.mockResolvedValue({ tags: [] });
      mockGetOrCreateTags.mockResolvedValueOnce([] as any);
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
    it('getOrCreateTagsがdisconnect/connectより先に実行されること', async () => {
      const callOrder: string[] = [];

      mockGetOrCreateTags.mockImplementationOnce(async () => {
        callOrder.push('getOrCreateTags');
        return [{ id: '2', name: 'tag-b', category: null, createdAt: new Date(), updatedAt: new Date() }] as any;
      });

      prismaMock.article.findUniqueOrThrow.mockImplementation(async () => {
        callOrder.push('findUniqueOrThrow');
        return { tags: [{ id: '1' }] };
      });

      prismaMock.article.update.mockImplementation(
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
        ['tag-b']
      );

      // 意味のある順序制約のみアサート（実装の内部順序変更に耐えられるよう緩和）
      expect(callOrder).toContain('summary-update');
      expect(callOrder).toContain('findUniqueOrThrow');
      expect(callOrder.indexOf('getOrCreateTags')).toBeLessThan(callOrder.indexOf('disconnect'));
      expect(callOrder.indexOf('getOrCreateTags')).toBeLessThan(callOrder.indexOf('connect'));
      expect(callOrder.slice(-2)).toEqual(['disconnect', 'connect']);
    });
  });
});
