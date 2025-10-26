/**
 * Summary Manager Service
 *
 * Orchestrates summary generation workflows for articles.
 * Extracted from scripts/scheduled/manage-summaries.ts for better reusability and testability.
 */

import { PrismaClient, Article, Source, Prisma } from '@prisma/client';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { getAppDependencies } from '@/lib/di/bootstrap';
import { SUMMARY_VERSION } from '@/types/article';
import { cleanupText, finalCleanup } from '@/lib/services/summary-generation';
import type { UnifiedSummaryService } from '@/lib/ai/service/unified-summary-service';

export interface SummaryGenerationOptions {
  source?: string;
  limit?: number;
  force?: boolean;
  batch?: number;
  days?: number;
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

type ArticleWithSource = Article & { source: Source };

/**
 * Summary Manager
 *
 * Dependencies are injected in the constructor for testability.
 */
export class SummaryManager {
  private apiStats: ApiStats;
  private summaryService: UnifiedSummaryService;

  constructor(
    private prisma: PrismaClient,
    summaryService?: UnifiedSummaryService
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
   * Generate summaries for articles without summaries
   */
  async generateSummaries(options: SummaryGenerationOptions): Promise<SummaryGenerationResult> {
    console.error('Starting summary generation...');
    const startTime = Date.now();

    try {
      // Check for new articles (conditional processing)
      const hasNewArticles = await this.checkNewArticles(options);
      if (!hasNewArticles) {
        console.error('No new articles found. Skipping summary generation.');
        return { generated: 0, errors: 0, skipped: 0 };
      }

      // Query articles without summaries
      const whereCondition: Prisma.ArticleWhereInput = {
        summary: null
      };

      if (options.source) {
        whereCondition.source = { name: options.source };
      }

      const articles = await this.prisma.article.findMany({
        where: whereCondition,
        include: { source: true },
        orderBy: { publishedAt: 'desc' },
        take: options.limit || 50
      }) as ArticleWithSource[];

      console.error(`Found ${articles.length} articles without summaries`);

      let generated = 0;
      let errors = 0;

      // Process articles
      for (const article of articles) {
        try {
          const result = await this.generateSummaryAndTags(
            article.title,
            article.content || '',
            article.id
          );

          // Update article with generated summary and tags
          await this.prisma.article.update({
            where: { id: article.id },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              translatedTitle: result.translatedTitle,
              summaryVersion: SUMMARY_VERSION,
              summaryComputedAt: new Date(),
            }
          });

          // Update tags if provided
          if (result.tags && result.tags.length > 0) {
            // Tag update logic (simplified for now)
            console.error(`Generated summary for: ${article.title.substring(0, 50)}...`);
          }

          generated++;

          // Invalidate cache
          await cacheInvalidator.invalidateArticle(article.id);

        } catch (error) {
          console.error(`Error processing article ${article.id}:`, error);
          errors++;
        }
      }

      const duration = Date.now() - startTime;
      console.error(`Summary generation completed: ${generated} generated, ${errors} errors (${duration}ms)`);

      return { generated, errors, skipped: 0 };

    } catch (error) {
      console.error('Fatal error in summary generation:', error);
      throw error;
    }
  }

  /**
   * Regenerate existing summaries
   * Placeholder for future implementation
   */
  async regenerateSummaries(_options: SummaryGenerationOptions): Promise<SummaryGenerationResult> {
    // To be implemented in next session
    throw new Error('regenerateSummaries not yet implemented');
  }

  /**
   * Generate summaries for articles with missing summaries
   * Placeholder for future implementation
   */
  async generateMissingSummaries(_options: SummaryGenerationOptions): Promise<SummaryGenerationResult> {
    // To be implemented in next session
    throw new Error('generateMissingSummaries not yet implemented');
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
        detailedSummary: finalCleanup(result.detailedSummary),
        translatedTitle: result.translatedTitle,
        tags: result.tags
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

    console.error(`Found ${newArticlesCount} new articles to process`);
    return true;
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
