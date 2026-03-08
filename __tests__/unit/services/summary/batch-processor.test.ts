/**
 * batch-processor のユニットテスト
 *
 * M-6/M-9: generateSummaryAndTags が空配列 [] を返した場合でも
 * updateArticleTags が呼ばれる（tags != null の条件で通過する）ことを検証する。
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

/** PrismaClient の article.update をモックするオブジェクトを生成するヘルパー */
function makePrismaMock() {
  const articleUpdate = jest.fn().mockResolvedValue({});
  const txClient = {
    article: { update: articleUpdate },
  };
  return {
    prisma: {
      article: {
        update: articleUpdate,
      },
      $transaction: jest.fn((fn: (tx: typeof txClient) => Promise<void>) =>
        fn(txClient)
      ),
    } as unknown as import('@prisma/client').PrismaClient,
    articleUpdate,
  };
}

describe('batch-processor', () => {
  describe('processArticleWithTimeout', () => {
    describe('updateArticleTags call when generateSummaryAndTags returns empty tags array', () => {
      it('should call article.update twice when tags is empty array []', async () => {
        const { prisma, articleUpdate } = makePrismaMock();
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

        // tags=[] でも updateArticleTags が呼ばれる:
        // 1回目: summary 更新, 2回目: tags 更新（空配列でも呼ばれる）
        expect(articleUpdate).toHaveBeenCalledTimes(2);

        // 2回目の呼び出し（tags更新）を確認
        const secondCall = articleUpdate.mock.calls[1];
        expect(secondCall[0]).toMatchObject({
          where: { id: 'article-empty-tags' },
          data: {
            tags: {
              set: [],
              connectOrCreate: [],
            },
          },
        });
      });
    });

    describe('updateArticleTags call when generateSummaryAndTags returns non-empty tags array', () => {
      it('should call article.update twice when tags is non-empty', async () => {
        const { prisma, articleUpdate } = makePrismaMock();
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

        // 1回目: summary 更新, 2回目: tags 更新
        expect(articleUpdate).toHaveBeenCalledTimes(2);

        // 2回目の呼び出し（tags更新）でタグが connectOrCreate されている
        const secondCall = articleUpdate.mock.calls[1];
        expect(secondCall[0]).toMatchObject({
          where: { id: 'article-with-tags' },
          data: {
            tags: {
              set: [],
              connectOrCreate: [
                { where: { name: 'TypeScript' }, create: { name: 'TypeScript' } },
                { where: { name: 'React' }, create: { name: 'React' } },
              ],
            },
          },
        });
      });
    });

    describe('updateArticleTags skipped when generateSummaryAndTags returns null tags', () => {
      it('should call article.update only once when tags is null', async () => {
        const { prisma, articleUpdate } = makePrismaMock();
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
        const { prisma, articleUpdate } = makePrismaMock();
        const article = makeArticle('article-cache-error');

        cacheInvalidator.onArticleUpdated.mockRejectedValueOnce(
          new Error('redis down')
        );

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
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ articleId: 'article-cache-error' }),
          'Cache invalidation failed, continuing'
        );
      });
    });
  });
});
