/**
 * Batch processing logic for summary generation.
 *
 * Handles parallel processing with timeout, rate limiting, and error tracking.
 */

import { PrismaClient, Prisma, SkipReason } from '@prisma/client';
import pLimit from 'p-limit';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { classifyError, isRetryable } from '@/lib/fetchers/retry-handler';
import { logger } from '@/lib/logger';
import { SUMMARY_VERSION } from '@/types/article';
import type { ArticleWithSource } from '@/types/models';
import type { SummaryGenerationOptions, SummaryAndTags } from './types';
import { env } from '@/lib/config/env';

/**
 * Concurrency limit for parallel summary generation.
 */
const SUMMARY_CONCURRENCY = env.SUMMARY_CONCURRENCY;

/**
 * Timeout for individual summary generation in milliseconds.
 */
const SUMMARY_TIMEOUT = env.SUMMARY_TIMEOUT;

/**
 * Minimum delay between requests to respect rate limits (milliseconds).
 */
const SUMMARY_REQUEST_DELAY = env.SUMMARY_REQUEST_DELAY;

export { SUMMARY_CONCURRENCY, SUMMARY_TIMEOUT };

/**
 * Process a single article with timeout protection.
 *
 * Note: Timeout provides fail-fast behavior but does not cancel in-flight API calls.
 * The underlying AI service call will continue until completion. This is a known
 * limitation - true cancellation would require AbortSignal propagation through
 * the AI service layer (SummaryService, GeminiClient, etc).
 */
export async function processArticleWithTimeout(
  article: ArticleWithSource,
  content: string,
  generateSummaryAndTags: (
    title: string,
    content: string,
    articleId?: string
  ) => Promise<SummaryAndTags>,
  prisma: PrismaClient
): Promise<{ success: boolean; articleId: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT);

  try {
    const abortPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => {
          reject(
            new Error(`Summary generation timed out after ${SUMMARY_TIMEOUT}ms`)
          );
        },
        { once: true }
      );
    });

    const result = await Promise.race([
      processArticle(article, content, generateSummaryAndTags, prisma),
      abortPromise,
    ]);

    return result;
  } catch (error) {
    const isTimeout =
      error instanceof Error && error.message.includes('timed out');
    const isRateLimit =
      error instanceof Error &&
      (error.message.includes('429') || error.message.includes('rate limit'));

    logger.error(
      {
        articleId: article.id,
        err: error,
        isTimeout,
        isRateLimit,
      },
      'Error processing article'
    );

    // Record error in database
    try {
      const isTransientError = isRetryable(classifyError(error));
      const errorMsg = error instanceof Error ? error.message : String(error);
      const pendingWhere: Prisma.ArticleWhereInput = {
        id: article.id,
        skipReason: null,
        OR: [{ summary: null }, { summary: '' }],
      };

      if (isTransientError) {
        const { count } = await prisma.article.updateMany({
          where: { ...pendingWhere, summaryError: null },
          data: { summaryError: errorMsg },
        });

        if (count === 0) {
          await prisma.article.updateMany({
            where: pendingWhere,
            data: {
              skipReason: SkipReason.QUALITY_FAILED,
              summaryError: errorMsg,
            },
          });
        }
      } else {
        // Content/quality issue - skip immediately, no retry
        await prisma.article.updateMany({
          where: pendingWhere,
          data: {
            skipReason: SkipReason.QUALITY_FAILED,
            summaryError: errorMsg,
          },
        });
      }
    } catch (dbError) {
      logger.warn(
        { articleId: article.id, err: dbError },
        'Failed to record summary error'
      );
    }

    return { success: false, articleId: article.id };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Re-export SummaryAndTags for backward compatibility
export type { SummaryAndTags } from './types';

/**
 * Process a single article (generate summary, update DB, invalidate cache).
 */
async function processArticle(
  article: ArticleWithSource,
  content: string,
  generateSummaryAndTags: (
    title: string,
    content: string,
    articleId?: string
  ) => Promise<SummaryAndTags>,
  prisma: PrismaClient
): Promise<{ success: boolean; articleId: string }> {
  const result = await generateSummaryAndTags(
    article.title,
    content,
    article.id
  );

  await prisma.$transaction(async (tx) => {
    await tx.article.update({
      where: { id: article.id },
      data: {
        summary: result.summary,
        detailedSummary: result.detailedSummary,
        translatedTitle: result.translatedTitle,
        summaryVersion: SUMMARY_VERSION.CURRENT,
        summaryComputedAt: new Date(),
        summaryError: null,
        skipReason: null,
      },
    });

    if (result.tags != null) {
      await updateArticleTags(tx, article.id, result.tags);
    }
  });

  try {
    await cacheInvalidator.onArticleUpdated(article.id, {
      summary: result.summary,
      detailedSummary: result.detailedSummary,
    });
  } catch (cacheError) {
    logger.warn(
      { articleId: article.id, err: cacheError },
      'Cache invalidation failed, continuing'
    );
  }

  logger.info(
    { articleId: article.id, title: article.title.substring(0, 50) },
    'Generated summary'
  );

  return { success: true, articleId: article.id };
}

/**
 * Update article tags.
 */
export async function updateArticleTags(
  prisma: PrismaClient | Prisma.TransactionClient,
  articleId: string,
  tagNames: string[]
): Promise<void> {
  if (tagNames.length === 0) return;

  // 現在のタグ名を取得
  const current = await prisma.article.findUniqueOrThrow({
    where: { id: articleId },
    select: { tags: { select: { name: true } } },
  });

  const currentTagNames = new Set(current.tags.map((t) => t.name));
  const newTagNames = tagNames.filter((name) => !currentTagNames.has(name));

  if (newTagNames.length > 0) {
    await prisma.article.update({
      where: { id: articleId },
      data: {
        tags: {
          connectOrCreate: newTagNames.map((name) => ({
            where: { name },
            create: { name },
          })),
        },
      },
    });
  }
}

/**
 * Run parallel batch processing for articles.
 */
export async function runParallelBatch(
  validArticles: Array<{ article: ArticleWithSource; content: string }>,
  generateSummaryAndTags: (
    title: string,
    content: string,
    articleId?: string
  ) => Promise<SummaryAndTags>,
  prisma: PrismaClient
): Promise<{ generated: number; errors: number }> {
  const limit = pLimit(SUMMARY_CONCURRENCY);

  const tasks = validArticles.map(({ article, content }) =>
    limit(async () => {
      await sleep(Math.random() * SUMMARY_REQUEST_DELAY);
      return processArticleWithTimeout(
        article,
        content,
        generateSummaryAndTags,
        prisma
      );
    })
  );

  const results = await Promise.allSettled(tasks);

  let generated = 0;
  let errors = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value.success) {
        generated++;
      } else {
        errors++;
      }
    } else {
      logger.error(
        { err: result.reason },
        'Unexpected error in parallel processing'
      );
      errors++;
    }
  }

  return { generated, errors };
}

/**
 * Check if there are new articles to process.
 */
export async function checkNewArticles(
  prisma: PrismaClient,
  options?: SummaryGenerationOptions
): Promise<boolean> {
  const days = options?.days ?? 1;
  const from = new Date();
  from.setDate(from.getDate() - days);

  const whereCondition: Prisma.ArticleWhereInput = {
    OR: [{ summary: null }, { summary: '' }],
    skipReason: null,
    publishedAt: { gte: from },
  };

  if (options?.source) {
    whereCondition.source = { name: options.source };
  }

  const hasNewArticle = await prisma.article.findFirst({
    where: whereCondition,
    select: { id: true },
  });

  if (!hasNewArticle) {
    return false;
  }

  const newArticlesCount = await prisma.article.count({
    where: whereCondition,
  });

  logger.info({ count: newArticlesCount }, 'Found new articles to process');
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
