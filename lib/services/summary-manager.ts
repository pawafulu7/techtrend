/**
 * Summary Manager Service
 *
 * Orchestrates summary generation workflows for articles.
 * Extracted from scripts/scheduled/manage-summaries.ts for better reusability and testability.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { getAppDependencies } from '@/lib/di/bootstrap';
import { SUMMARY_VERSION } from '@/types/article';
import { cleanupText, normalizeDetailedSummary } from '@/lib/services/summary-generation';
import type { UnifiedSummaryServiceImpl } from '@/lib/ai/service/unified-summary-service';
import type { ArticleWithSource } from '@/types/models';

export interface SummaryGenerationOptions {
  /** Source filter by name */
  source?: string;
  /** Maximum articles to process in generateSummaries (default: 50) */
  limit?: number;
  /** Force processing regardless of checks */
  force?: boolean;
  /** Maximum articles to process in regenerate/missing flows (default: 10) */
  batch?: number;
  /** Days to look back for missing summaries (default: 7) */
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
   * Generate summaries for articles without summaries
   */
  async generateSummaries(options: SummaryGenerationOptions): Promise<SummaryGenerationResult> {
    console.error('Starting summary generation...');
    const startTime = Date.now();

    try {
      // Check for new articles (conditional processing)
      // Skip check if force option is enabled
      if (!options.force) {
        const hasNewArticles = await this.checkNewArticles(options);
        if (!hasNewArticles) {
          console.error('No new articles found. Skipping summary generation.');
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
          if (!article.content || article.content.trim().length === 0) {
            console.error(`Skipping article ${article.id}: no content available`);
            continue;
          }

          const result = await this.generateSummaryAndTags(
            article.title,
            article.content,
            article.id
          );

          // Update article with generated summary and tags
          await this.prisma.article.update({
            where: { id: article.id },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              translatedTitle: result.translatedTitle,
              summaryVersion: SUMMARY_VERSION.UNIFIED,
              summaryComputedAt: new Date(),
            }
          });

          // Update tags
          if (result.tags?.length > 0) {
            await this.updateArticleTags(article.id, result.tags);
          }

          console.error(`Generated summary for: ${article.title.substring(0, 50)}...`);
          generated++;

          // Invalidate cache
          await cacheInvalidator.onArticleUpdated(article.id, {
            summary: result.summary,
            detailedSummary: result.detailedSummary
          });

          // Rate limiting
          await this.sleep(2000);

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
   */
  async regenerateSummaries(options: SummaryGenerationOptions): Promise<SummaryGenerationResult> {
    console.error('Starting summary regeneration...');
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
        console.error('No articles to regenerate');
        return { generated: 0, errors: 0 };
      }

      console.error(`Found ${articles.length} articles to regenerate`);

      let generated = 0;
      let errors = 0;

      for (const article of articles) {
        try {
          if (!article.content || article.content.trim().length === 0) {
            console.error(`Skipping article ${article.id}: no content available`);
            continue;
          }

          const result = await this.generateSummaryAndTags(
            article.title,
            article.content,
            article.id
          );

          // Update article with regenerated summary
          await this.prisma.article.update({
            where: { id: article.id },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              translatedTitle: result.translatedTitle,
              summaryVersion: SUMMARY_VERSION.UNIFIED,
              summaryComputedAt: new Date()
            }
          });

          // Update tags
          if (result.tags?.length > 0) {
            await this.updateArticleTags(article.id, result.tags);
          }

          console.error(`Regenerated: ${article.title.substring(0, 50)}...`);
          generated++;

          // Invalidate cache
          await cacheInvalidator.onArticleUpdated(article.id, {
            summary: result.summary,
            detailedSummary: result.detailedSummary
          });

          // Rate limiting
          await this.sleep(3000);

        } catch (error) {
          console.error(`Error processing article ${article.id}:`, error);
          errors++;
        }
      }

      const duration = Math.round((Date.now() - startTime) / 1000);
      console.error(`Regeneration completed: ${generated} generated, ${errors} errors (${duration}s)`);

      return { generated, errors };

    } catch (error) {
      console.error('Fatal error in regeneration:', error);
      throw error;
    }
  }

  /**
   * Generate summaries for articles with missing summaries
   */
  async generateMissingSummaries(options: SummaryGenerationOptions): Promise<SummaryGenerationResult> {
    console.error('Starting missing summaries generation...');

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

      console.error(`Found ${articles.length} articles with missing summaries (past ${options.days || 7} days)`);

      if (articles.length === 0) {
        console.error('No articles with missing summaries');
        return { generated: 0, errors: 0 };
      }

      let generated = 0;
      let errors = 0;

      for (const article of articles) {
        try {
          if (!article.content || article.content.trim().length === 0) {
            console.error(`Skipping article ${article.id}: no content available`);
            continue;
          }

          const result = await this.generateSummaryAndTags(
            article.title,
            article.content,
            article.id
          );

          // Update article
          await this.prisma.article.update({
            where: { id: article.id },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              translatedTitle: result.translatedTitle,
              summaryVersion: SUMMARY_VERSION.UNIFIED,
              summaryComputedAt: new Date()
            }
          });

          // Update tags
          if (result.tags?.length > 0) {
            await this.updateArticleTags(article.id, result.tags);
          }

          console.error(`Generated: ${article.title.substring(0, 50)}...`);
          generated++;

          // Invalidate cache
          await cacheInvalidator.onArticleUpdated(article.id, {
            summary: result.summary,
            detailedSummary: result.detailedSummary
          });

          // Rate limiting
          await this.sleep(2000);

        } catch (error) {
          console.error(`Error processing article ${article.id}:`, error);
          errors++;
        }
      }

      console.error(`Missing summaries completed: ${generated} generated, ${errors} errors`);

      return { generated, errors };

    } catch (error) {
      console.error('Fatal error in missing summaries generation:', error);
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

    console.error(`Found ${newArticlesCount} new articles to process`);
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
