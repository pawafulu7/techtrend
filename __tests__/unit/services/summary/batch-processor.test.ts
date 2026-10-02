/**
 * batch-processor のユニットテスト
 *
 * additive connectパターン対応:
 * - updateArticleTags が空配列で早期リターンすること
 * - 非空配列では resolveTags でタグを解決し、現在のタグと ID で比べて差分だけ connect すること
 * - 既存タグが保持されること（set:[] による全削除なし）
 * - 大文字小文字だけが違う既存のタグを、別のタグとして繋がないこと（#672）
 */

// タグの解決（lower(name) をキーにした探索・作成。実 DB の結合テストで確かめる）。
// ここでは lower(name) から ID を作り、大文字小文字だけが違う名前を同じタグにする
jest.mock('@/lib/services/tag-service', () => ({
  resolveTags: jest.fn(async (tags: Array<{ name: string }>) =>
    tags.map((tag) => ({
      id: `tag:${tag.name.toLowerCase()}`,
      name: tag.name,
      category: null,
    }))
  ),
}));

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
import { env } from '@/lib/config/env';
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
    tags: existingTags.map((name) => ({ id: `tag:${name.toLowerCase()}` })),
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
      $transaction: jest.fn(
        (
          fn: (tx: typeof txClient) => Promise<void>,
          _options?: { timeout?: number }
        ) => fn(txClient)
      ),
    } as unknown as import('@/lib/prisma-exports').PrismaClient,
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
      it('should resolve tags and connect only new ones by id', async () => {
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

        // findUniqueOrThrow で現在のタグを ID で読み取り
        expect(articleFindUniqueOrThrow).toHaveBeenCalledWith({
          where: { id: 'article-with-tags' },
          select: { tags: { select: { id: true } } },
        });

        // 1回目: summary更新, 2回目: tags更新（connectのみ、setなし）
        expect(articleUpdate).toHaveBeenCalledTimes(2);

        const secondCall = articleUpdate.mock.calls[1];
        expect(secondCall[0]).toMatchObject({
          where: { id: 'article-with-tags' },
          data: {
            tags: {
              connect: [{ id: 'tag:typescript' }, { id: 'tag:react' }],
            },
          },
        });
        // set:[] が含まれていないことを確認
        expect(secondCall[0].data.tags).not.toHaveProperty('set');
      });
    });

    describe('updateArticleTags preserves existing tags (additive connect)', () => {
      it('should only connect tags not already attached', async () => {
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

        // 2回目: tags更新 — 既存の TypeScript を除き、React のみ connect
        expect(articleUpdate).toHaveBeenCalledTimes(2);
        const secondCall = articleUpdate.mock.calls[1];
        expect(secondCall[0]).toMatchObject({
          where: { id: 'article-existing-tags' },
          data: {
            tags: {
              connect: [{ id: 'tag:react' }],
            },
          },
        });
      });

      it('should not attach a differently-cased name of an attached tag again', async () => {
        // 既存タグ MCP がある記事に、AI が Mcp を返した
        const { prisma, articleUpdate } = makePrismaMock(['MCP']);
        const article = makeArticle('article-case-variant');

        const generateSummaryAndTags = jest.fn().mockResolvedValue({
          summary: 'テスト要約。',
          detailedSummary: '・テスト詳細',
          translatedTitle: undefined,
          tags: ['Mcp'],
        });

        const result = await processArticleWithTimeout(
          article,
          '記事の本文',
          generateSummaryAndTags,
          prisma
        );

        expect(result.success).toBe(true);
        // summary更新の1回だけ（タグは同じ ID なので繋ぎ直さない）
        expect(articleUpdate).toHaveBeenCalledTimes(1);
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
          { timeout: env.DB_TRANSACTION_TIMEOUT }
        );
      });
    });
  });
});
