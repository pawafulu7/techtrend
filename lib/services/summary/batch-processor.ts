/**
 * Batch processing logic for summary generation.
 *
 * Handles parallel processing with timeout, rate limiting, and error tracking.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import pLimit from 'p-limit';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { logger, sanitizeError } from '@/lib/logger';
import { SUMMARY_VERSION } from '@/types/article';
import type { ArticleWithSource } from '@/types/models';
import type { SummaryGenerationOptions, SummaryAndTags } from './types';

/**
 * Concurrency limit for parallel summary generation.
 */
const parsedConcurrency = Number.parseInt(
  process.env.SUMMARY_CONCURRENCY ?? '3',
  10
);
const SUMMARY_CONCURRENCY =
  Number.isFinite(parsedConcurrency) && parsedConcurrency >= 1
    ? parsedConcurrency
    : 3;

/**
 * Timeout for individual summary generation in milliseconds.
 */
const parsedTimeout = Number.parseInt(
  process.env.SUMMARY_TIMEOUT ?? '90000',
  10
);
const SUMMARY_TIMEOUT =
  Number.isFinite(parsedTimeout) && parsedTimeout >= 1000
    ? parsedTimeout
    : 90000;

/**
 * Minimum delay between requests to respect rate limits (milliseconds).
 */
const parsedRequestDelay = Number.parseInt(
  process.env.SUMMARY_REQUEST_DELAY ?? '500',
  10
);
const SUMMARY_REQUEST_DELAY =
  Number.isFinite(parsedRequestDelay) && parsedRequestDelay >= 0
    ? parsedRequestDelay
    : 500;

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
        error: sanitizeError(error),
        isTimeout,
        isRateLimit,
      },
      'Error processing article'
    );

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
      { articleId: article.id, error: sanitizeError(cacheError) },
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
  await prisma.article.update({
    where: { id: articleId },
    data: {
      tags: {
        set: [],
        connectOrCreate: tagNames.map((name) => ({
          where: { name },
          create: { name },
        })),
      },
    },
  });
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
        { error: sanitizeError(result.reason) },
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
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const whereCondition: Prisma.ArticleWhereInput = {
    AND: [
      {
        OR: [
          { summary: null },
          { summary: '' },
          { detailedSummary: null },
          { detailedSummary: '' },
        ],
      },
      {
        OR: [
          { createdAt: { gte: oneHourAgo } },
          { publishedAt: { gte: oneHourAgo } },
        ],
      },
    ],
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
