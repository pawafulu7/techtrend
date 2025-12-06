/**
 * Summary Manager Service
 *
 * Orchestrates summary generation workflows for articles.
 * Extracted from scripts/scheduled/manage-summaries.ts for better reusability and testability.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import pLimit from 'p-limit';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { getAppDependencies } from '@/lib/di/bootstrap';
import { logger, sanitizeError } from '@/lib/logger';
import { SUMMARY_VERSION } from '@/types/article';
import { cleanupText, normalizeDetailedSummary } from '@/lib/services/summary-generation';
import type { UnifiedSummaryServiceImpl } from '@/lib/ai/service/unified-summary-service';
import type { ArticleWithSource } from '@/types/models';

/**
 * Minimum content length required for summary generation.
 * Articles shorter than this will be skipped as they're too short for meaningful summaries.
 * Configurable via MIN_CONTENT_LENGTH environment variable (default: 100 characters).
 * Set to 0 to disable the minimum length check.
 */
const parsedMinContentLength = Number.parseInt(process.env.MIN_CONTENT_LENGTH ?? '100', 10);
const MIN_CONTENT_LENGTH = Number.isNaN(parsedMinContentLength) ? 100 : parsedMinContentLength;

/**
 * Concurrency limit for parallel summary generation.
 * Controls how many AI API requests can run simultaneously.
 * Configurable via SUMMARY_CONCURRENCY environment variable (default: 3).
 * Keep this conservative to avoid rate limiting from Gemini API.
 */
const parsedConcurrency = Number.parseInt(process.env.SUMMARY_CONCURRENCY ?? '3', 10);
const SUMMARY_CONCURRENCY = Number.isFinite(parsedConcurrency) && parsedConcurrency >= 1
  ? parsedConcurrency
  : 3;

/**
 * Timeout for individual summary generation in milliseconds.
 * Configurable via SUMMARY_TIMEOUT environment variable (default: 90000 = 90 seconds).
 */
const parsedTimeout = Number.parseInt(process.env.SUMMARY_TIMEOUT ?? '90000', 10);
const SUMMARY_TIMEOUT = Number.isFinite(parsedTimeout) && parsedTimeout >= 1000
  ? parsedTimeout
  : 90000;

/**
 * Minimum delay between requests to respect rate limits (milliseconds).
 * Applied per request slot (not total delay).
 */
const SUMMARY_REQUEST_DELAY = 500;

/**
 * Content validation result for article processing
 */
interface ContentValidationResult {
  valid: boolean;
  content?: string;
  reason?: string;
}

export interface SummaryGenerationOptions {
  /** Source filter by name */
  source?: string;
  /** Maximum articles to process in generateSummaries (default: 50) */
  limit?: number;
  /** Force processing regardless of checks */
  force?: boolean;
  /** Maximum articles to process in regenerate/missing flows (default: 10) */
  batch?: number;
  /** Days to look back: generateSummaries default=1, generateMissingSummaries default=7 */
  days?: number;
  /** Specific article IDs to regenerate */
  articleIds?: string[];
}

export interface SummaryGenerationResult {
  generated: number;
  errors: number;
  skipped?: number;
}

interface SummaryAndTags {
  summary: string;
  detailedSummary: string;
  translatedTitle?: string;
  tags: string[];
}

interface ApiStats {
  attempts: number;
  successes: number;
  failures: number;
  overloadErrors: number;
  startTime: number;
}


/**
 * Summary Manager
 *
 * Dependencies are injected in the constructor for testability.
 */
export class SummaryManager {
  private apiStats: ApiStats;
  private summaryService: UnifiedSummaryServiceImpl;

  constructor(
    private prisma: PrismaClient,
    summaryService?: UnifiedSummaryServiceImpl
  ) {
    this.apiStats = {
      attempts: 0,
      successes: 0,
      failures: 0,
      overloadErrors: 0,
      startTime: Date.now()
    };

    // Use provided service or get from DI container
    this.summaryService = summaryService || getAppDependencies().service;
  }

  /**
   * Validate article content for summary generation.
   * Checks if content exists and meets minimum length requirements.
   */
  private validateArticleContent(article: ArticleWithSource): ContentValidationResult {
    const contentLength = article.content?.trim().length || 0;

    if (contentLength === 0) {
      return { valid: false, reason: 'no content available' };
    }

    if (MIN_CONTENT_LENGTH > 0 && contentLength < MIN_CONTENT_LENGTH) {
      return { valid: false, reason: `content too short (${contentLength} < ${MIN_CONTENT_LENGTH})` };
    }

    return { valid: true, content: article.content! };
  }

  /**
   * Generate summaries for articles without summaries
   */
  async generateSummaries(options: SummaryGenerationOptions): Promise<SummaryGenerationResult> {
    logger.info('Starting summary generation');
    const startTime = Date.now();

    try {
      const hasTargetArticleIds = Array.isArray(options.articleIds) && options.articleIds.length > 0;

      // Check for new articles (conditional processing)
      // Skip check if force option is enabled
      // Also skip when specific articleIds are provided (explicit target list)
      if (!options.force && !hasTargetArticleIds) {
        const hasNewArticles = await this.checkNewArticles(options);
        if (!hasNewArticles) {
          logger.info('No new articles found. Skipping summary generation');
          return { generated: 0, errors: 0, skipped: 0 };
        }
      }

      // Query articles without summaries
      const whereCondition: Prisma.ArticleWhereInput = {
        OR: [
          { summary: null },
          { summary: '' }
        ]
      };

      if (hasTargetArticleIds) {
        whereCondition.id = { in: options.articleIds };
      } else {
        // articleIds not specified: limit to recent N days (default: 1 day)
        const days = options.days ?? 1;
        const from = new Date();
        from.setDate(from.getDate() - days);
        whereCondition.publishedAt = { gte: from };
      }

      if (options.source) {
        whereCondition.source = { name: options.source };
      }

      const articles = await this.prisma.article.findMany({
        where: whereCondition,
        include: { source: true },
        orderBy: { publishedAt: 'desc' },
        take: hasTargetArticleIds
          ? options.articleIds!.length
          : options.limit || 50
      }) as ArticleWithSource[];

      logger.info(
        {
          count: articles.length,
          filteredByIds: hasTargetArticleIds ? options.articleIds!.length : undefined,
          concurrency: SUMMARY_CONCURRENCY,
          timeout: SUMMARY_TIMEOUT,
        },
        'Found articles without summaries, starting parallel processing'
      );

      // Validate articles first and collect valid ones
      const validArticles: Array<{ article: ArticleWithSource; content: string }> = [];
      let skipped = 0;

      for (const article of articles) {
        const validation = this.validateArticleContent(article);
        if (!validation.valid) {
          logger.warn({ articleId: article.id, reason: validation.reason }, 'Skipping article');
          skipped++;
        } else {
          validArticles.push({ article, content: validation.content! });
        }
      }

      if (validArticles.length === 0) {
        logger.info({ skipped }, 'No valid articles to process');
        return { generated: 0, errors: 0, skipped };
      }

      // Process valid articles in parallel with p-limit
      const limit = pLimit(SUMMARY_CONCURRENCY);

      const tasks = validArticles.map(({ article, content }) =>
        limit(async () => {
          // Add small jitter to avoid burst requests
          await this.sleep(Math.random() * SUMMARY_REQUEST_DELAY);

          return this.processArticleWithTimeout(article, content);
        })
      );

      const results = await Promise.allSettled(tasks);

      // Count results
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
          // Promise rejected (unexpected error)
          logger.error({ error: sanitizeError(result.reason) }, 'Unexpected error in parallel processing');
          errors++;
        }
      }

      const duration = Date.now() - startTime;
      logger.info({ generated, skipped, errors, durationMs: duration }, 'Summary generation completed');

      return { generated, errors, skipped };

    } catch (error) {
      logger.error({ error: sanitizeError(error) }, 'Fatal error in summary generation');
      throw error;
    }
  }

  /**
   * Regenerate existing summaries
   */
  async regenerateSummaries(options: SummaryGenerationOptions): Promise<SummaryGenerationResult> {
    logger.info('Starting summary regeneration');
    const startTime = Date.now();

    try {
      const query: Prisma.ArticleFindManyArgs = {
        include: { source: true },
        orderBy: { publishedAt: 'desc' },
        take: options.batch || 10
      };

      // If articleIds are specified, only target those articles
      if (options.articleIds && options.articleIds.length > 0) {
        query.where = {
          id: { in: options.articleIds }
        };
        query.take = options.articleIds.length;
      }
      // If not force, only target problematic summaries
      else if (!options.force) {
        query.where = {
          OR: [
            { summary: { endsWith: '...' } },
            { summary: { contains: 'error' } },
            { detailedSummary: null }
          ]
        };
      }

      if (options.source) {
        query.where = query.where || {};
        query.where.source = { name: options.source };
      }

      const articles = await this.prisma.article.findMany(query) as ArticleWithSource[];

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
          const validation = this.validateArticleContent(article);
          if (!validation.valid) {
            logger.warn({ articleId: article.id, reason: validation.reason }, 'Skipping article');
            skipped++;
            continue;
          }

          const result = await this.generateSummaryAndTags(
            article.title,
            validation.content!,
            article.id
          );

          // Update article with regenerated summary
          await this.prisma.article.update({
            where: { id: article.id },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              translatedTitle: result.translatedTitle,
              summaryVersion: SUMMARY_VERSION.CURRENT,
              summaryComputedAt: new Date()
            }
          });

          // Update tags
          if (result.tags?.length > 0) {
            await this.updateArticleTags(article.id, result.tags);
          }

          logger.info({ articleId: article.id, title: article.title.substring(0, 50) }, 'Regenerated summary');
          generated++;

          // Invalidate cache
          await cacheInvalidator.onArticleUpdated(article.id, {
            summary: result.summary,
            detailedSummary: result.detailedSummary
          });

          // Rate limiting
          await this.sleep(3000);

        } catch (error) {
          logger.error({ articleId: article.id, error: sanitizeError(error) }, 'Error processing article');
          errors++;
        }
      }

      const duration = Math.round((Date.now() - startTime) / 1000);
      logger.info({ generated, skipped, errors, durationSec: duration }, 'Regeneration completed');

      return { generated, errors, skipped };

    } catch (error) {
      logger.error({ error: sanitizeError(error) }, 'Fatal error in regeneration');
      throw error;
    }
  }

  /**
   * Generate summaries for articles with missing summaries
   */
  async generateMissingSummaries(options: SummaryGenerationOptions): Promise<SummaryGenerationResult> {
    logger.info('Starting missing summaries generation');

    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - (options.days || 7));

      const where: Prisma.ArticleWhereInput = {
        OR: [
          { summary: null },
          { summary: '' }
        ],
        publishedAt: {
          gte: daysAgo
        }
      };

      if (options.source) {
        where.source = { name: options.source };
      }

      const query: Prisma.ArticleFindManyArgs = {
        where,
        include: { source: true },
        orderBy: { publishedAt: 'desc' }
      };

      const articles = await this.prisma.article.findMany(query) as ArticleWithSource[];

      logger.info({ count: articles.length, days: options.days || 7 }, 'Found articles with missing summaries');

      if (articles.length === 0) {
        logger.info('No articles with missing summaries');
        return { generated: 0, errors: 0, skipped: 0 };
      }

      let generated = 0;
      let errors = 0;
      let skipped = 0;

      for (const article of articles) {
        try {
          const validation = this.validateArticleContent(article);
          if (!validation.valid) {
            logger.warn({ articleId: article.id, reason: validation.reason }, 'Skipping article');
            skipped++;
            continue;
          }

          const result = await this.generateSummaryAndTags(
            article.title,
            validation.content!,
            article.id
          );

          // Update article
          await this.prisma.article.update({
            where: { id: article.id },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              translatedTitle: result.translatedTitle,
              summaryVersion: SUMMARY_VERSION.CURRENT,
              summaryComputedAt: new Date()
            }
          });

          // Update tags
          if (result.tags?.length > 0) {
            await this.updateArticleTags(article.id, result.tags);
          }

          logger.info({ articleId: article.id, title: article.title.substring(0, 50) }, 'Generated summary');
          generated++;

          // Invalidate cache
          await cacheInvalidator.onArticleUpdated(article.id, {
            summary: result.summary,
            detailedSummary: result.detailedSummary
          });

          // Rate limiting
          await this.sleep(2000);

        } catch (error) {
          logger.error({ articleId: article.id, error: sanitizeError(error) }, 'Error processing article');
          errors++;
        }
      }

      logger.info({ generated, skipped, errors }, 'Missing summaries completed');

      return { generated, errors, skipped };

    } catch (error) {
      logger.error({ error: sanitizeError(error) }, 'Fatal error in missing summaries generation');
      throw error;
    }
  }

  /**
   * Generate summary and tags for a single article
   * @private
   */
  private async generateSummaryAndTags(
    title: string,
    content: string,
    articleId?: string
  ): Promise<SummaryAndTags> {
    this.apiStats.attempts++;

    try {
      const result = await this.summaryService.generateSummary({
        title,
        content,
        qualityThreshold: 40,
        articleId,
      });

      this.apiStats.successes++;

      return {
        summary: cleanupText(result.summary),
        detailedSummary: result.detailedSummary
          ? normalizeDetailedSummary(result.detailedSummary)
          : '',
        translatedTitle: result.translatedTitle,
        tags: result.tags || []
      };
    } catch (error) {
      this.apiStats.failures++;

      // Track 503/overload errors
      if (error instanceof Error && error.message.includes('503')) {
        this.apiStats.overloadErrors++;
      }

      throw error;
    }
  }

  /**
   * Check if there are new articles to process
   * @private
   */
  private async checkNewArticles(options?: SummaryGenerationOptions): Promise<boolean> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const whereCondition: Prisma.ArticleWhereInput = {
      AND: [
        {
          OR: [
            { summary: null },
            { summary: '' },
            { detailedSummary: null },
            { detailedSummary: '' }
          ]
        },
        {
          OR: [
            { createdAt: { gte: oneHourAgo } },
            { publishedAt: { gte: oneHourAgo } }
          ]
        }
      ]
    };

    if (options?.source) {
      whereCondition.source = { name: options.source };
    }

    const hasNewArticle = await this.prisma.article.findFirst({
      where: whereCondition,
      select: { id: true }
    });

    if (!hasNewArticle) {
      return false;
    }

    const newArticlesCount = await this.prisma.article.count({
      where: whereCondition
    });

    logger.info({ count: newArticlesCount }, 'Found new articles to process');
    return true;
  }

  /**
   * Update article tags
   * @private
   */
  private async updateArticleTags(articleId: string, tagNames: string[]): Promise<void> {
    await this.prisma.article.update({
      where: { id: articleId },
      data: {
        tags: {
          set: [], // Clear existing tags
          connectOrCreate: tagNames.map((name) => ({
            where: { name },
            create: { name }
          }))
        }
      }
    });
  }

  /**
   * Process a single article with timeout protection
   *
   * Note: Timeout provides fail-fast behavior but does not cancel in-flight API calls.
   * The underlying AI service call will continue until completion. This is a known
   * limitation - true cancellation would require AbortSignal propagation through
   * the AI service layer (SummaryService, GeminiClient, etc).
   *
   * @private
   */
  private async processArticleWithTimeout(
    article: ArticleWithSource,
    content: string
  ): Promise<{ success: boolean; articleId: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT);

    try {
      // Create a promise that rejects on abort
      const abortPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`Summary generation timed out after ${SUMMARY_TIMEOUT}ms`));
        }, { once: true });
      });

      // Race between actual processing and timeout
      const result = await Promise.race([
        this.processArticle(article, content),
        abortPromise,
      ]);

      return result;
    } catch (error) {
      const isTimeout = error instanceof Error && error.message.includes('timed out');
      const isRateLimit = error instanceof Error &&
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

  /**
   * Process a single article (generate summary, update DB, invalidate cache)
   * @private
   */
  private async processArticle(
    article: ArticleWithSource,
    content: string
  ): Promise<{ success: boolean; articleId: string }> {
    const result = await this.generateSummaryAndTags(
      article.title,
      content,
      article.id
    );

    // Update article with generated summary and tags
    await this.prisma.article.update({
      where: { id: article.id },
      data: {
        summary: result.summary,
        detailedSummary: result.detailedSummary,
        translatedTitle: result.translatedTitle,
        summaryVersion: SUMMARY_VERSION.CURRENT,
        summaryComputedAt: new Date(),
      }
    });

    // Update tags
    if (result.tags?.length > 0) {
      await this.updateArticleTags(article.id, result.tags);
    }

    // Invalidate cache
    await cacheInvalidator.onArticleUpdated(article.id, {
      summary: result.summary,
      detailedSummary: result.detailedSummary
    });

    // Log success after all operations complete (DB update, tag update, cache invalidation)
    logger.info({ articleId: article.id, title: article.title.substring(0, 50) }, 'Generated summary');

    return { success: true, articleId: article.id };
  }

  /**
   * Sleep for rate limiting
   * @private
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get API statistics
   */
  getStats(): ApiStats {
    return { ...this.apiStats };
  }

  /**
   * Reset API statistics
   */
  resetStats(): void {
    this.apiStats = {
      attempts: 0,
      successes: 0,
      failures: 0,
      overloadErrors: 0,
      startTime: Date.now()
    };
  }
}
