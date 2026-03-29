/**
 * Summary generation orchestration and validation logic.
 *
 * Handles regeneration, missing summary detection, and sequential processing flows.
 */

import { PrismaClient, Prisma, SkipReason } from '@prisma/client';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { classifyError, isRetryable } from '@/lib/fetchers/retry-handler';
import { logger, sanitizeError } from '@/lib/logger';
import { SUMMARY_VERSION } from '@/types/article';
import type { ArticleWithSource } from '@/types/models';
import type {
  SummaryGenerationOptions,
  SummaryGenerationResult,
  SummaryAndTags,
} from './types';
import { updateArticleTags } from './batch-processor';
import { env } from '@/lib/config/env';

/**
 * Minimum content length required for summary generation.
 */
const MIN_CONTENT_LENGTH = env.MIN_CONTENT_LENGTH;

/**
 * Content validation result for article processing.
 */
interface ContentValidationResult {
  valid: boolean;
  content?: string;
  reason?: string;
  reasonCode?: 'NO_CONTENT' | 'THIN_CONTENT';
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
    return {
      valid: false,
      reason: 'no content available',
      reasonCode: 'NO_CONTENT' as const,
    };
  }

  if (MIN_CONTENT_LENGTH > 0 && contentLength < MIN_CONTENT_LENGTH) {
    return {
      valid: false,
      reason: `content too short (${contentLength} < ${MIN_CONTENT_LENGTH})`,
      reasonCode: 'THIN_CONTENT' as const,
    };
  }

  return { valid: true, content: article.content! };
}

function normalizeBatchSize(batch?: number): number {
  return batch && batch > 0 ? batch : 10;
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
    const batchSize = normalizeBatchSize(options.batch);
    const query: Prisma.ArticleFindManyArgs = {
      include: { source: true },
      orderBy: { publishedAt: 'desc' },
      take: batchSize,
    };

    if (options.articleIds && options.articleIds.length > 0) {
      // Process all specified IDs by chunking rather than truncating with take
      const chunks: string[][] = [];
      for (let i = 0; i < options.articleIds.length; i += batchSize) {
        chunks.push(options.articleIds.slice(i, i + batchSize));
      }

      let totalGenerated = 0;
      let totalErrors = 0;
      let totalSkipped = 0;

      for (const [chunkIndex, chunk] of chunks.entries()) {
        query.where = { id: { in: chunk } };
        query.take = chunk.length;

        const articles = (await prisma.article.findMany(
          query
        )) as ArticleWithSource[];

        if (articles.length === 0) continue;

        logger.info(
          {
            count: articles.length,
            chunk: chunkIndex + 1,
            totalChunks: chunks.length,
          },
          'Processing article chunk'
        );

        for (const article of articles) {
          try {
            const validation = validateArticleContent(article);
            if (!validation.valid) {
              logger.warn(
                { articleId: article.id, reason: validation.reason },
                'Skipping article'
              );
              totalSkipped++;
              continue;
            }

            const result = await generateSummaryAndTags(
              article.title,
              validation.content!,
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

            logger.info(
              { articleId: article.id, title: article.title.substring(0, 50) },
              'Regenerated summary'
            );
            totalGenerated++;

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

            await sleep(3000);
          } catch (error) {
            logger.error(
              { articleId: article.id, error: sanitizeError(error) },
              'Error processing article'
            );
            totalErrors++;
          }
        }
      }

      const duration = Math.round((Date.now() - startTime) / 1000);
      logger.info(
        {
          generated: totalGenerated,
          skipped: totalSkipped,
          errors: totalErrors,
          durationSec: duration,
        },
        'Regeneration completed'
      );

      return {
        generated: totalGenerated,
        errors: totalErrors,
        skipped: totalSkipped,
      };
    }

    if (!options.force) {
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

    const hasTargetArticleIds =
      Array.isArray(options.articleIds) && options.articleIds.length > 0;

    const where: Prisma.ArticleWhereInput = {
      OR: [{ summary: null }, { summary: '' }],
      ...(hasTargetArticleIds
        ? { id: { in: options.articleIds } }
        : {
            skipReason: null,
            publishedAt: { gte: daysAgo },
          }),
    };

    if (options.source) {
      where.source = { name: options.source };
    }

    const query: Prisma.ArticleFindManyArgs = {
      where,
      include: { source: true },
      orderBy: { publishedAt: 'desc' },
      take: hasTargetArticleIds
        ? options.articleIds!.length
        : normalizeBatchSize(options.batch),
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

    const noContentIds: string[] = [];
    const thinContentIds: string[] = [];

    for (const article of articles) {
      try {
        const validation = validateArticleContent(article);
        if (!validation.valid) {
          logger.warn(
            { articleId: article.id, reason: validation.reason },
            'Skipping article'
          );
          if (validation.reasonCode === 'NO_CONTENT') {
            noContentIds.push(article.id);
          } else {
            thinContentIds.push(article.id);
          }
          skipped++;
          continue;
        }

        const result = await generateSummaryAndTags(
          article.title,
          validation.content!,
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
        // Record error in database
        try {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          const isTransientError = isRetryable(classifyError(error));
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
            // Non-transient error or second transient failure - give up
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
            { articleId: article.id, error: sanitizeError(dbError) },
            'Failed to record summary error'
          );
        }
        errors++;
      }
    }

    // Batch update skip reasons for validation failures
    try {
      if (noContentIds.length > 0) {
        await prisma.article.updateMany({
          where: {
            id: { in: noContentIds },
            OR: [{ summary: null }, { summary: '' }],
          },
          data: {
            skipReason: SkipReason.CONTENT_FETCH_FAILED,
            summaryError: null,
          },
        });
      }
      if (thinContentIds.length > 0) {
        await prisma.article.updateMany({
          where: {
            id: { in: thinContentIds },
            OR: [{ summary: null }, { summary: '' }],
          },
          data: {
            skipReason: SkipReason.THIN_CONTENT,
            summaryError: null,
          },
        });
      }
    } catch (dbError) {
      logger.warn(
        { error: sanitizeError(dbError) },
        'Failed to record skip reasons'
      );
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
