/**
 * Diff Summary Service
 *
 * Service for generating weekly topic diff summaries per category.
 * Uses LLM extraction pipeline for AI-powered analysis.
 */

import { getISOWeek as getDateFnsISOWeek, getISOWeekYear } from 'date-fns';
import { PrismaClient, BatchStatus } from '@prisma/client';
import { logger } from '@/lib/logger';
import { prisma as defaultPrisma } from '@/lib/prisma';
import {
  LLMExtractionPipeline,
  getLLMExtractionPipeline,
} from '../extraction/llm-extraction-pipeline';
import { BatchExecutor, BatchJob } from '../extraction/batch-executor';
import {
  diffSummaryConfig,
  DiffSummaryInput,
  TopicData,
} from '../extraction/prompts/diff-summary-prompt';
import { DiffSummaryOutput } from '../extraction/extraction-schemas';
import {
  SOURCE_CATEGORIES,
  SourceCategoryId,
} from '@/lib/constants/source-categories';

/**
 * ISO week format helper
 * Uses date-fns for accurate DST handling
 */
export function getISOWeek(date: Date): string {
  const weekNum = getDateFnsISOWeek(date);
  const year = getISOWeekYear(date);
  return `${year}-W${weekNum.toString().padStart(2, '0')}`;
}

/**
 * Get the previous ISO week
 */
export function getPreviousISOWeek(isoWeek: string): string {
  // Parse the ISO week string
  const match = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!match) throw new Error(`Invalid ISO week format: ${isoWeek}`);

  const year = parseInt(match[1]);
  const week = parseInt(match[2]);

  if (week === 1) {
    // Go to last week of previous year (52 or 53)
    // Find a date that's definitely in the previous week by going back to Dec 28
    // (Dec 28 is always in the last week of its year per ISO 8601)
    const prevYear = year - 1;
    const dec28 = new Date(prevYear, 11, 28);
    return getISOWeek(dec28);
  }

  return `${year}-W${(week - 1).toString().padStart(2, '0')}`;
}

/**
 * Get the next ISO week
 */
export function getNextISOWeek(isoWeek: string): string {
  const match = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!match) throw new Error(`Invalid ISO week format: ${isoWeek}`);

  const year = parseInt(match[1]);
  const week = parseInt(match[2]);

  // Check if this year has 53 weeks by checking if Dec 28 is in week 53
  const dec28 = new Date(year, 11, 28);
  const lastWeek = getDateFnsISOWeek(dec28);

  if (week >= lastWeek) {
    // Go to week 1 of next year
    return `${year + 1}-W01`;
  }

  return `${year}-W${(week + 1).toString().padStart(2, '0')}`;
}

/**
 * Get date range for an ISO week
 */
export function getWeekDateRange(isoWeek: string): { start: Date; end: Date } {
  const match = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!match) throw new Error(`Invalid ISO week format: ${isoWeek}`);

  const year = parseInt(match[1]);
  const week = parseInt(match[2]);

  // Find the first Thursday of the year
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const firstMonday = new Date(jan4);
  firstMonday.setDate(jan4.getDate() - dayOfWeek + 1);

  // Calculate the Monday of the target week
  const start = new Date(firstMonday);
  start.setDate(firstMonday.getDate() + (week - 1) * 7);
  start.setHours(0, 0, 0, 0);

  // Sunday of the target week
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export interface DiffSummaryServiceOptions {
  pipeline?: LLMExtractionPipeline;
  prisma?: PrismaClient;
  concurrency?: number;
}

interface CategoryDiffResult {
  categorySlug: string;
  success: boolean;
  data?: DiffSummaryOutput;
  error?: string;
}

/**
 * Diff Summary Service
 */
export class DiffSummaryService {
  private pipeline: LLMExtractionPipeline;
  private prisma: PrismaClient;
  private concurrency: number;

  constructor(options?: DiffSummaryServiceOptions) {
    this.pipeline = options?.pipeline || getLLMExtractionPipeline();
    this.prisma = options?.prisma || defaultPrisma;
    this.concurrency = options?.concurrency || 3;
  }

  /**
   * Generate diff summary for a single category
   */
  async generateForCategory(
    categorySlug: SourceCategoryId,
    currentPeriod?: string,
    baselinePeriod?: string
  ): Promise<CategoryDiffResult> {
    const current = currentPeriod || getISOWeek(new Date());
    const baseline = baselinePeriod || getPreviousISOWeek(current);

    const category = SOURCE_CATEGORIES[categorySlug];
    if (!category) {
      return {
        categorySlug,
        success: false,
        error: `Category not found: ${categorySlug}`,
      };
    }

    logger.info(
      { categorySlug, currentPeriod: current, baselinePeriod: baseline },
      'Generating diff summary'
    );

    try {
      // Get topic data for both periods
      const [currentTopics, baselineTopics] = await Promise.all([
        this.getTopicsForPeriod(categorySlug, current),
        this.getTopicsForPeriod(categorySlug, baseline),
      ]);

      // Skip if no data in either period
      if (currentTopics.length === 0 && baselineTopics.length === 0) {
        logger.info(
          { categorySlug },
          'No topics found in either period, skipping'
        );
        return {
          categorySlug,
          success: true,
          data: {
            changes: [],
            unchanged: [],
            summary: 'No articles found in either period for comparison.',
            keyTakeaways: [
              'No data available for this category in the specified periods.',
            ],
          },
        };
      }

      // Prepare input for LLM
      const input: DiffSummaryInput = {
        category: categorySlug,
        categoryName: category.name,
        currentPeriod: current,
        baselinePeriod: baseline,
        currentTopics,
        baselineTopics,
      };

      // Extract diff summary using LLM
      const result = await this.pipeline.extract(input, diffSummaryConfig);

      if (!result.success || !result.data) {
        return {
          categorySlug,
          success: false,
          error: result.error || 'Extraction failed',
        };
      }

      // Save to database (upsert for idempotency)
      await this.saveDiffSummary(categorySlug, current, baseline, result.data);

      return {
        categorySlug,
        success: true,
        data: result.data,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        { categorySlug, error: errorMessage },
        'Failed to generate diff summary'
      );

      // Save failed status
      await this.saveFailedDiffSummary(
        categorySlug,
        current,
        baseline,
        errorMessage
      );

      return {
        categorySlug,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Generate diff summaries for all categories
   */
  async generateForAllCategories(
    currentPeriod?: string,
    baselinePeriod?: string
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: CategoryDiffResult[];
  }> {
    const categories = Object.keys(SOURCE_CATEGORIES) as SourceCategoryId[];

    // Calculate periods once to avoid redundant calls
    const current = currentPeriod || getISOWeek(new Date());
    const baseline = baselinePeriod || getPreviousISOWeek(current);

    // Create batch jobs
    const jobs: BatchJob<{
      categorySlug: SourceCategoryId;
      current: string;
      baseline: string;
    }>[] = categories.map((categorySlug) => ({
      id: categorySlug,
      input: {
        categorySlug,
        current,
        baseline,
      },
    }));

    // Execute with BatchExecutor
    const executor = new BatchExecutor({
      concurrency: this.concurrency,
      delayBetweenBatchesMs: 1500,
    });

    const summary = await executor.execute(jobs, async (job) => {
      return this.generateForCategory(
        job.input.categorySlug,
        job.input.current,
        job.input.baseline
      );
    });

    // Transform results
    const results: CategoryDiffResult[] = summary.results.map((r) => {
      if (r.success && r.result) {
        return r.result;
      }
      return {
        categorySlug: r.job.input.categorySlug,
        success: false,
        error: r.error || 'Unknown error',
      };
    });

    return {
      total: summary.total,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  /**
   * Get topics for a specific period and category
   */
  private async getTopicsForPeriod(
    categorySlug: SourceCategoryId,
    isoWeek: string
  ): Promise<TopicData[]> {
    const { start, end } = getWeekDateRange(isoWeek);
    const category = SOURCE_CATEGORIES[categorySlug];

    if (!category) return [];

    // Get articles from this category's sources within the date range
    const articles = await this.prisma.article.findMany({
      where: {
        sourceId: { in: category.sourceIds },
        publishedAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        id: true,
        title: true,
        tags: true,
      },
    });

    // Aggregate topics from tags
    const topicMap = new Map<
      string,
      { count: number; articleIds: string[]; headlines: string[] }
    >();

    for (const article of articles) {
      const tags = article.tags || [];
      for (const tag of tags) {
        // Tag is a relation object with id, name, category fields
        const normalizedTag = tag.name.toLowerCase().trim();
        if (!normalizedTag) continue;

        const existing = topicMap.get(normalizedTag);
        if (existing) {
          existing.count++;
          existing.articleIds.push(article.id);
          existing.headlines.push(article.title);
        } else {
          topicMap.set(normalizedTag, {
            count: 1,
            articleIds: [article.id],
            headlines: [article.title],
          });
        }
      }
    }

    // Convert to TopicData array, sorted by count
    const topics: TopicData[] = Array.from(topicMap.entries())
      .map(([topic, data]) => ({
        topic,
        count: data.count,
        articleIds: data.articleIds.slice(0, 10), // Limit to 10 article IDs
        headlines: data.headlines.slice(0, 5), // Limit to 5 headlines
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30); // Limit to top 30 topics

    return topics;
  }

  /**
   * Save successful diff summary to database
   */
  private async saveDiffSummary(
    categorySlug: string,
    currentPeriod: string,
    baselinePeriod: string,
    data: DiffSummaryOutput
  ): Promise<void> {
    await this.prisma.diffSummary.upsert({
      where: {
        categorySlug_currentPeriod: {
          categorySlug,
          currentPeriod,
        },
      },
      create: {
        categorySlug,
        currentPeriod,
        baselinePeriod,
        changes: data.changes,
        unchanged: data.unchanged,
        status: BatchStatus.SUCCESS,
        modelVersion: this.pipeline.getModelVersion(),
        promptVersion: diffSummaryConfig.promptVersion,
      },
      update: {
        baselinePeriod,
        changes: data.changes,
        unchanged: data.unchanged,
        status: BatchStatus.SUCCESS,
        errorMessage: null,
        modelVersion: this.pipeline.getModelVersion(),
        promptVersion: diffSummaryConfig.promptVersion,
        generatedAt: new Date(),
      },
    });
  }

  /**
   * Save failed diff summary to database
   */
  private async saveFailedDiffSummary(
    categorySlug: string,
    currentPeriod: string,
    baselinePeriod: string,
    errorMessage: string
  ): Promise<void> {
    await this.prisma.diffSummary.upsert({
      where: {
        categorySlug_currentPeriod: {
          categorySlug,
          currentPeriod,
        },
      },
      create: {
        categorySlug,
        currentPeriod,
        baselinePeriod,
        changes: [],
        unchanged: [],
        status: BatchStatus.FAILED,
        errorMessage,
        modelVersion: this.pipeline.getModelVersion(),
        promptVersion: diffSummaryConfig.promptVersion,
      },
      update: {
        baselinePeriod,
        status: BatchStatus.FAILED,
        errorMessage,
        modelVersion: this.pipeline.getModelVersion(),
        promptVersion: diffSummaryConfig.promptVersion,
        generatedAt: new Date(),
      },
    });
  }

  /**
   * Get latest diff summaries for all categories
   */
  async getLatestSummaries(): Promise<
    {
      categorySlug: string;
      currentPeriod: string;
      summary: string;
      changes: DiffSummaryOutput['changes'];
      keyTakeaways: string[];
      generatedAt: Date;
    }[]
  > {
    const summaries = await this.prisma.diffSummary.findMany({
      where: { status: BatchStatus.SUCCESS },
      orderBy: { generatedAt: 'desc' },
      distinct: ['categorySlug'],
    });

    return summaries.map((s) => {
      const changes = s.changes as DiffSummaryOutput['changes'];
      const newCount = changes.filter((c) => c.type === 'new').length;
      const trendingCount = changes.filter((c) => c.type === 'trending').length;
      const deprecatedCount = changes.filter(
        (c) => c.type === 'deprecated'
      ).length;

      // Generate descriptive summary from changes data
      const summaryParts: string[] = [];
      if (newCount > 0) summaryParts.push(`${newCount} new`);
      if (trendingCount > 0) summaryParts.push(`${trendingCount} trending`);
      if (deprecatedCount > 0)
        summaryParts.push(`${deprecatedCount} deprecated`);

      const summary =
        summaryParts.length > 0
          ? `${changes.length} changes: ${summaryParts.join(', ')}`
          : 'No significant changes';

      // Extract key takeaways from high-significance changes
      const keyTakeaways = changes
        .filter((c) => c.significance === 'high')
        .slice(0, 3)
        .map((c) => `${c.topic}: ${c.description}`);

      return {
        categorySlug: s.categorySlug,
        currentPeriod: s.currentPeriod,
        summary,
        changes,
        keyTakeaways,
        generatedAt: s.generatedAt,
      };
    });
  }
}

// Singleton instance
let instance: DiffSummaryService | null = null;

export function getDiffSummaryService(): DiffSummaryService {
  if (!instance) {
    instance = new DiffSummaryService();
  }
  return instance;
}

// For testing
export function resetDiffSummaryService(): void {
  instance = null;
}
