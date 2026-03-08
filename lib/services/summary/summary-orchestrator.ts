/**
 * Summary generation orchestration and validation logic.
 *
 * Handles regeneration, missing summary detection, and sequential processing flows.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { logger, sanitizeError } from '@/lib/logger';
import { SUMMARY_VERSION } from '@/types/article';
import type { ArticleWithSource } from '@/types/models';
import type {
  SummaryGenerationOptions,
  SummaryGenerationResult,
  SummaryAndTags,
} from './types';
import { updateArticleTags } from './batch-processor';

/**
 * Minimum content length required for summary generation.
 */
const parsedMinContentLength = Number.parseInt(
  process.env.MIN_CONTENT_LENGTH ?? '100',
  10
);
const MIN_CONTENT_LENGTH = Number.isNaN(parsedMinContentLength)
  ? 100
  : parsedMinContentLength;

/**
 * Content validation result for article processing.
 */
interface ContentValidationResult {
  valid: boolean;
  content?: string;
  reason?: string;
}

/**
 * Validate article content for summary generation.
 * Checks if content exists and meets minimum length requirements.
 */
export function validateArticleContent(
  article: ArticleWithSource
): ContentValidationResult {
  const contentLength = article.content?.trim().length || 0;

  if (contentLength === 0) {
    return { valid: false, reason: 'no content available' };
  }

  if (MIN_CONTENT_LENGTH > 0 && contentLength < MIN_CONTENT_LENGTH) {
    return {
      valid: false,
      reason: `content too short (${contentLength} < ${MIN_CONTENT_LENGTH})`,
    };
  }

  return { valid: true, content: article.content! };
}

/**
 * Regenerate existing summaries.
 */
export async function regenerateSummaries(
  prisma: PrismaClient,
  options: SummaryGenerationOptions,
  generateSummaryAndTags: (
    title: string,
    content: string,
    articleId?: string
  ) => Promise<SummaryAndTags>
): Promise<SummaryGenerationResult> {
  logger.info('Starting summary regeneration');
  const startTime = Date.now();

  try {
    const batchSize = options.batch && options.batch > 0 ? options.batch : 10;
    const query: Prisma.ArticleFindManyArgs = {
      include: { source: true },
      orderBy: { publishedAt: 'desc' },
      take: batchSize,
    };

    if (options.articleIds && options.articleIds.length > 0) {
      query.where = {
        id: { in: options.articleIds },
      };
      query.take = Math.min(options.articleIds.length, batchSize);
    } else if (!options.force) {
      query.where = {
        OR: [
          { summary: { endsWith: '...' } },
          { summary: { contains: 'error' } },
          { detailedSummary: null },
        ],
      };
    }

    if (options.source) {
      query.where = query.where || {};
      query.where.source = { name: options.source };
    }

    const articles = (await prisma.article.findMany(
      query
    )) as ArticleWithSource[];

    if (articles.length === 0) {
      logger.info('No articles to regenerate');
      return { generated: 0, errors: 0, skipped: 0 };
    }

    logger.info({ count: articles.length }, 'Found articles to regenerate');

    let generated = 0;
    let errors = 0;
    let skipped = 0;

    for (const article of articles) {
      try {
        const validation = validateArticleContent(article);
        if (!validation.valid) {
          logger.warn(
            { articleId: article.id, reason: validation.reason },
            'Skipping article'
          );
          skipped++;
          continue;
        }

        const result = await generateSummaryAndTags(
          article.title,
          validation.content!,
          article.id
        );

        await prisma.article.update({
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
          await updateArticleTags(prisma, article.id, result.tags);
        }

        logger.info(
          { articleId: article.id, title: article.title.substring(0, 50) },
          'Regenerated summary'
        );
        generated++;

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

        // Rate limiting
        await sleep(3000);
      } catch (error) {
        logger.error(
          { articleId: article.id, error: sanitizeError(error) },
          'Error processing article'
        );
        errors++;
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    logger.info(
      { generated, skipped, errors, durationSec: duration },
      'Regeneration completed'
    );

    return { generated, errors, skipped };
  } catch (error) {
    logger.error(
      { error: sanitizeError(error) },
      'Fatal error in regeneration'
    );
    throw error;
  }
}

/**
 * Generate summaries for articles with missing summaries.
 */
export async function generateMissingSummaries(
  prisma: PrismaClient,
  options: SummaryGenerationOptions,
  generateSummaryAndTags: (
    title: string,
    content: string,
    articleId?: string
  ) => Promise<SummaryAndTags>
): Promise<SummaryGenerationResult> {
  logger.info('Starting missing summaries generation');

  try {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - (options.days || 7));

    const where: Prisma.ArticleWhereInput = {
      OR: [{ summary: null }, { summary: '' }],
      publishedAt: {
        gte: daysAgo,
      },
    };

    if (options.source) {
      where.source = { name: options.source };
    }

    const query: Prisma.ArticleFindManyArgs = {
      where,
      include: { source: true },
      orderBy: { publishedAt: 'desc' },
      take: options.batch && options.batch > 0 ? options.batch : 10,
    };

    const articles = (await prisma.article.findMany(
      query
    )) as ArticleWithSource[];

    logger.info(
      { count: articles.length, days: options.days || 7 },
      'Found articles with missing summaries'
    );

    if (articles.length === 0) {
      logger.info('No articles with missing summaries');
      return { generated: 0, errors: 0, skipped: 0 };
    }

    let generated = 0;
    let errors = 0;
    let skipped = 0;

    for (const article of articles) {
      try {
        const validation = validateArticleContent(article);
        if (!validation.valid) {
          logger.warn(
            { articleId: article.id, reason: validation.reason },
            'Skipping article'
          );
          skipped++;
          continue;
        }

        const result = await generateSummaryAndTags(
          article.title,
          validation.content!,
          article.id
        );

        await prisma.article.update({
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
          await updateArticleTags(prisma, article.id, result.tags);
        }

        logger.info(
          { articleId: article.id, title: article.title.substring(0, 50) },
          'Generated summary'
        );
        generated++;

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

        // Rate limiting
        await sleep(2000);
      } catch (error) {
        logger.error(
          { articleId: article.id, error: sanitizeError(error) },
          'Error processing article'
        );
        errors++;
      }
    }

    logger.info({ generated, skipped, errors }, 'Missing summaries completed');

    return { generated, errors, skipped };
  } catch (error) {
    logger.error(
      { error: sanitizeError(error) },
      'Fatal error in missing summaries generation'
    );
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
