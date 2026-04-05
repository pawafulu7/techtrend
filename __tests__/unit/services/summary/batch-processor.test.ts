/**
 * batch-processor のユニットテスト
 *
 * additive connectパターン対応:
 * - updateArticleTags が空配列で早期リターンすること
 * - 非空配列では findUniqueOrThrow で現在タグを読み、差分のみ connectOrCreate すること
 * - 既存タグが保持されること（set:[] による全削除なし）
 */

jest.mock('@/lib/cache/cache-invalidator', () => ({
  cacheInvalidator: {
    onArticleUpdated: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  sanitizeError: jest.fn((e) => e),
}));

import { processArticleWithTimeout } from '@/lib/services/summary/batch-processor';
import type { ArticleWithSource } from '@/types/models';

/** ArticleWithSource のミニマムなスタブを生成するヘルパー */
function makeArticle(id = 'article-1'): ArticleWithSource {
  return {
    id,
    title: 'テスト記事',
    url: 'https://example.com/article',
    content: '記事の本文',
    summary: null,
    detailedSummary: null,
    translatedTitle: null,
    summaryVersion: null,
    summaryComputedAt: null,
    publishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    sourceId: 'source-1',
    category: null,
    skipReason: null,
    qualityScore: null,
    source: {
      id: 'source-1',
      name: 'Test Source',
      url: 'https://example.com',
      feedUrl: null,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      category: null,
      language: null,
      description: null,
      fetchIntervalMinutes: 60,
      lastFetchedAt: null,
      errorCount: 0,
      lastErrorAt: null,
      lastErrorMessage: null,
    },
  } as unknown as ArticleWithSource;
}

/** PrismaClient の article.update / findUniqueOrThrow をモックするオブジェクトを生成するヘルパー */
function makePrismaMock(existingTags: string[] = []) {
  const articleUpdate = jest.fn().mockResolvedValue({});
  const articleFindUniqueOrThrow = jest.fn().mockResolvedValue({
    tags: existingTags.map((name) => ({ name })),
  });
  const txClient = {
    article: { update: articleUpdate, findUniqueOrThrow: articleFindUniqueOrThrow },
  };
  return {
    prisma: {
      article: {
        update: articleUpdate,
        findUniqueOrThrow: articleFindUniqueOrThrow,
      },
      $transaction: jest.fn((fn: (tx: typeof txClient) => Promise<void>) =>
        fn(txClient)
      ),
    } as unknown as import('@prisma/client').PrismaClient,
    articleUpdate,
    articleFindUniqueOrThrow,
  };
}

describe('batch-processor', () => {
  describe('processArticleWithTimeout', () => {
    describe('updateArticleTags call when generateSummaryAndTags returns empty tags array', () => {
      it('should call article.update only once when tags is empty array (early return)', async () => {
        const { prisma, articleUpdate, articleFindUniqueOrThrow } = makePrismaMock();
        const article = makeArticle('article-empty-tags');

        // tags が空配列 [] を返す generateSummaryAndTags モック
        const generateSummaryAndTags = jest.fn().mockResolvedValue({
          summary: 'テスト要約。',
          detailedSummary: '・テスト詳細',
          translatedTitle: undefined,
          tags: [],
        });

        const result = await processArticleWithTimeout(
          article,
          '記事の本文',
          generateSummaryAndTags,
          prisma
        );

        expect(result.success).toBe(true);
        expect(result.articleId).toBe('article-empty-tags');

        // tags=[] では updateArticleTags が早期リターンするため、article.updateは1回のみ（summary更新）
        expect(articleUpdate).toHaveBeenCalledTimes(1);
        expect(articleFindUniqueOrThrow).not.toHaveBeenCalled();
      });
    });

    describe('updateArticleTags call when generateSummaryAndTags returns non-empty tags array', () => {
      it('should read current tags and connectOrCreate only new ones', async () => {
        const { prisma, articleUpdate, articleFindUniqueOrThrow } = makePrismaMock();
        const article = makeArticle('article-with-tags');

        // tags が非空配列を返す generateSummaryAndTags モック
        const generateSummaryAndTags = jest.fn().mockResolvedValue({
          summary: 'テスト要約。',
          detailedSummary: '・テスト詳細',
          translatedTitle: undefined,
          tags: ['TypeScript', 'React'],
        });

        const result = await processArticleWithTimeout(
          article,
          '記事の本文',
          generateSummaryAndTags,
          prisma
        );

        expect(result.success).toBe(true);
        expect(result.articleId).toBe('article-with-tags');

        // findUniqueOrThrow で現在のタグを読み取り
        expect(articleFindUniqueOrThrow).toHaveBeenCalledWith({
          where: { id: 'article-with-tags' },
          select: { tags: { select: { name: true } } },
        });

        // 1回目: summary更新, 2回目: tags更新（connectOrCreateのみ、setなし）
        expect(articleUpdate).toHaveBeenCalledTimes(2);

        const secondCall = articleUpdate.mock.calls[1];
        expect(secondCall[0]).toMatchObject({
          where: { id: 'article-with-tags' },
          data: {
            tags: {
              connectOrCreate: [
                { where: { name: 'TypeScript' }, create: { name: 'TypeScript' } },
                { where: { name: 'React' }, create: { name: 'React' } },
              ],
            },
          },
        });
        // set:[] が含まれていないことを確認
        expect(secondCall[0].data.tags).not.toHaveProperty('set');
      });
    });

    describe('updateArticleTags preserves existing tags (additive connect)', () => {
      it('should only connectOrCreate tags not already attached', async () => {
        // 既存タグ ['TypeScript'] がある状態で ['TypeScript', 'React'] を追加
        const { prisma, articleUpdate, articleFindUniqueOrThrow } = makePrismaMock(['TypeScript']);
        const article = makeArticle('article-existing-tags');

        const generateSummaryAndTags = jest.fn().mockResolvedValue({
          summary: 'テスト要約。',
          detailedSummary: '・テスト詳細',
          translatedTitle: undefined,
          tags: ['TypeScript', 'React'],
        });

        const result = await processArticleWithTimeout(
          article,
          '記事の本文',
          generateSummaryAndTags,
          prisma
        );

        expect(result.success).toBe(true);

        // 2回目: tags更新 — 既存の TypeScript を除き、React のみ connectOrCreate
        expect(articleUpdate).toHaveBeenCalledTimes(2);
        const secondCall = articleUpdate.mock.calls[1];
        expect(secondCall[0]).toMatchObject({
          where: { id: 'article-existing-tags' },
          data: {
            tags: {
              connectOrCreate: [
                { where: { name: 'React' }, create: { name: 'React' } },
              ],
            },
          },
        });
      });
    });

    describe('updateArticleTags skipped when generateSummaryAndTags returns null tags', () => {
      it('should call article.update only once when tags is null', async () => {
        const { prisma, articleUpdate, articleFindUniqueOrThrow } = makePrismaMock();
        const article = makeArticle('article-null-tags');

        // tags が null を返す generateSummaryAndTags モック
        const generateSummaryAndTags = jest.fn().mockResolvedValue({
          summary: 'テスト要約。',
          detailedSummary: '・テスト詳細',
          translatedTitle: undefined,
          tags: null,
        });

        const result = await processArticleWithTimeout(
          article,
          '記事の本文',
          generateSummaryAndTags,
          prisma
        );

        expect(result.success).toBe(true);

        // tags=null の場合は updateArticleTags が呼ばれない -> article.update は1回のみ
        expect(articleUpdate).toHaveBeenCalledTimes(1);
        expect(articleFindUniqueOrThrow).not.toHaveBeenCalled();

        // 1回目の呼び出しは summary 更新のみ
        const firstCall = articleUpdate.mock.calls[0];
        expect(firstCall[0].data).not.toHaveProperty('tags');
        expect(firstCall[0].data).toHaveProperty('summary', 'テスト要約。');
      });
    });

    describe('cache invalidation failure handling', () => {
      it('should continue successfully when cache invalidation fails', async () => {
        const { cacheInvalidator } = jest.requireMock('@/lib/cache/cache-invalidator');
        const { logger } = jest.requireMock('@/lib/logger');
        const { prisma, articleUpdate, articleFindUniqueOrThrow } = makePrismaMock();
        const article = makeArticle('article-cache-error');

        cacheInvalidator.onArticleUpdated.mockRejectedValueOnce(
          new Error('redis down')
        );

        // tags=[] なので updateArticleTags は早期リターン
        const generateSummaryAndTags = jest.fn().mockResolvedValue({
          summary: 'テスト要約。',
          detailedSummary: '・テスト詳細',
          translatedTitle: undefined,
          tags: [],
        });

        const result = await processArticleWithTimeout(
          article,
          '記事の本文',
          generateSummaryAndTags,
          prisma
        );

        expect(result).toEqual({
          success: true,
          articleId: 'article-cache-error',
        });
        // tags=[] では updateArticleTags が早期リターンするため、article.updateは1回のみ
        expect(articleUpdate).toHaveBeenCalledTimes(1);
        expect(articleFindUniqueOrThrow).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ articleId: 'article-cache-error' }),
          'Cache invalidation failed, continuing'
        );
      });
    });

    describe('transaction timeout configuration', () => {
      it('should pass DB_TRANSACTION_TIMEOUT to $transaction options', async () => {
        const { prisma, articleUpdate } = makePrismaMock();
        const article = makeArticle('article-timeout-check');

        const generateSummaryAndTags = jest.fn().mockResolvedValue({
          summary: 'テスト要約。',
          detailedSummary: '・テスト詳細',
          translatedTitle: undefined,
          tags: [],
        });

        await processArticleWithTimeout(
          article,
          '記事の本文',
          generateSummaryAndTags,
          prisma
        );

        expect(prisma.$transaction).toHaveBeenCalledWith(
          expect.any(Function),
          { timeout: expect.any(Number) }
        );
      });
    });
  });
});
