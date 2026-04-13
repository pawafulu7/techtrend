/**
 * Summary Manager Service
 *
 * Orchestrates summary generation workflows for articles.
 * Extracted from scripts/scheduled/manage-summaries.ts for better reusability and testability.
 */

import { PrismaClient, Prisma, SkipReason } from '@/lib/prisma-exports';
import { getAppDependencies } from '@/lib/di/bootstrap';
import { logger } from '@/lib/logger';
import {
  cleanupText,
  normalizeDetailedSummary,
} from '@/lib/services/summary-generation';
import type { UnifiedSummaryServiceImpl } from '@/lib/ai/service/unified-summary-service';
import type { ArticleWithSource } from '@/types/models';
import type {
  SummaryGenerationOptions,
  SummaryGenerationResult,
  SummaryAndTags,
} from './types';
import { validateArticleContent } from './summary-orchestrator';
import {
  regenerateSummaries,
  generateMissingSummaries,
} from './summary-orchestrator';
import {
  runParallelBatch,
  SUMMARY_CONCURRENCY,
  SUMMARY_TIMEOUT,
} from './batch-processor';
import { checkNewArticles } from './batch-processor';

// Re-export types for backward compatibility
export type {
  SummaryGenerationOptions,
  SummaryGenerationResult,
} from './types';

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
      startTime: Date.now(),
    };

    // Use provided service or get from DI container
    this.summaryService = summaryService || getAppDependencies().service;
  }

  /**
   * Generate summaries for articles without summaries
   */
  async generateSummaries(
    options: SummaryGenerationOptions
  ): Promise<SummaryGenerationResult> {
    logger.info('Starting summary generation');
    const startTime = Date.now();

    try {
      const hasTargetArticleIds =
        Array.isArray(options.articleIds) && options.articleIds.length > 0;

      // Check for new articles (conditional processing)
      if (!options.force && !hasTargetArticleIds) {
        const hasNewArticles = await checkNewArticles(this.prisma, options);
        if (!hasNewArticles) {
          logger.info('No new articles found. Skipping summary generation');
          return { generated: 0, errors: 0, skipped: 0 };
        }
      }

      // Query articles without summaries
      const whereCondition: Prisma.ArticleWhereInput = {
        OR: [{ summary: null }, { summary: '' }],
        ...(hasTargetArticleIds ? {} : { skipReason: null }),
      };

      if (hasTargetArticleIds) {
        whereCondition.id = { in: options.articleIds };
      } else {
        const days = options.days ?? 1;
        const from = new Date();
        from.setDate(from.getDate() - days);
        whereCondition.publishedAt = { gte: from };
      }

      if (options.source) {
        whereCondition.source = { name: options.source };
      }

      const articles = (await this.prisma.article.findMany({
        where: whereCondition,
        include: { source: true },
        orderBy: { publishedAt: 'desc' },
        take: hasTargetArticleIds
          ? options.articleIds!.length
          : options.limit || 50,
      })) as ArticleWithSource[];

      logger.info(
        {
          count: articles.length,
          filteredByIds: hasTargetArticleIds
            ? options.articleIds!.length
            : undefined,
          concurrency: SUMMARY_CONCURRENCY,
          timeout: SUMMARY_TIMEOUT,
        },
        'Found articles without summaries, starting parallel processing'
      );

      // Validate articles first and collect valid ones
      const validArticles: Array<{
        article: ArticleWithSource;
        content: string;
      }> = [];
      let skipped = 0;

      const noContentIds: string[] = [];
      const thinContentIds: string[] = [];

      for (const article of articles) {
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
        } else {
          validArticles.push({ article, content: validation.content! });
        }
      }

      // Batch update skip reasons for validation failures
      try {
        if (noContentIds.length > 0) {
          await this.prisma.article.updateMany({
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
          await this.prisma.article.updateMany({
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
          { err: dbError },
          'Failed to record skip reasons'
        );
      }

      if (validArticles.length === 0) {
        logger.info({ skipped }, 'No valid articles to process');
        return { generated: 0, errors: 0, skipped };
      }

      // Process valid articles in parallel
      const { generated, errors } = await runParallelBatch(
        validArticles,
        this.generateSummaryAndTags.bind(this),
        this.prisma
      );

      const duration = Date.now() - startTime;
      logger.info(
        { generated, skipped, errors, durationMs: duration },
        'Summary generation completed'
      );

      return { generated, errors, skipped };
    } catch (error) {
      logger.error(
        { err: error },
        'Fatal error in summary generation'
      );
      throw error;
    }
  }

  /**
   * Regenerate existing summaries
   */
  async regenerateSummaries(
    options: SummaryGenerationOptions
  ): Promise<SummaryGenerationResult> {
    return regenerateSummaries(
      this.prisma,
      options,
      this.generateSummaryAndTags.bind(this)
    );
  }

  /**
   * Generate summaries for articles with missing summaries
   */
  async generateMissingSummaries(
    options: SummaryGenerationOptions
  ): Promise<SummaryGenerationResult> {
    return generateMissingSummaries(
      this.prisma,
      options,
      this.generateSummaryAndTags.bind(this)
    );
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
        tags: result.tags || [],
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
      startTime: Date.now(),
    };
  }
}
