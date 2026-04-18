/**
 * Category Filter Service
 *
 * Embedding-first article filtering with tag boost and recency decay.
 * Uses pgvector for efficient similarity search against category centroids.
 */

import { PrismaClient } from '@/lib/prisma-exports';
import { prisma } from '@/lib/prisma';
import pLimit from 'p-limit';
import { logger } from '@/lib/logger';
import { measureAsync, hrtimeDiffMs } from './tracing';
import type {
  PersonalizedFilterOptions,
  ScoredArticle,
  PersonalizedFilterMeta,
} from './types';
import { DEFAULT_SCORE_PARAMETERS } from './types';
import {
  getCategoryCentroids,
  getEmbeddingCandidates,
  checkTagMatches,
  DEFAULT_TOP_K_CANDIDATES,
  DEFAULT_MIN_SIMILARITY,
} from './filters/candidate-extractor';
import type {
  EmbeddingCandidate,
  CategoryCentroidRow,
} from './filters/candidate-extractor';
import {
  calculateRecencyDecay,
  calculateFinalScore,
  calculateScores,
  sortArticles,
} from './filters/score-aggregator';
import type { ScoredArticleWithMeta } from './filters/score-aggregator';

// Re-export pure functions and types for backward compatibility
export {
  calculateRecencyDecay,
  calculateFinalScore,
  computeWeightedCentroid,
} from './filters/score-aggregator';

// =============================================================================
// Category Filter Service
// =============================================================================

/**
 * Service for filtering articles based on user category preferences.
 *
 * Architecture (3-layer design per CodexMCP recommendation):
 * 1. Embedding candidate extraction (pgvector similarity search)
 * 2. Tag match and recency decay calculation (pure functions)
 * 3. Score aggregation and final ranking
 */
export class CategoryFilterService {
  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * Filter articles based on category preferences using embedding-first approach.
   *
   * @param options - Filter options including category IDs, period, and limit
   * @returns Scored and ranked articles with metadata
   */
  async filterArticles(
    options: PersonalizedFilterOptions
  ): Promise<{ articles: ScoredArticle[]; meta: PersonalizedFilterMeta }> {
    const startTime = Date.now();
    const {
      categoryIds,
      periodMonths,
      limit,
      offset = 0,
      sortBy = 'finalScore',
      sortOrder = 'desc',
    } = options;

    logger.info(
      { categoryIds, periodMonths, limit, offset },
      'Starting personalized article filtering'
    );

    return measureAsync('personalization.filterArticles', async (span) => {
      span.setAttributes({
        categoryCount: categoryIds.length,
        periodMonths,
        limit,
        offset,
      });

      try {
        // Step 0: Get category centroids
        const {
          centroids,
          cacheHit: centroidsCacheHit,
          fetchMs: centroidsFetchMs,
          lockWaitMs: centroidsLockWaitMs,
        } = await getCategoryCentroids(this.db, categoryIds);

        span.setAttributes({
          centroidsCacheHit,
          centroidsFetchMs,
          centroidsLockWaitMs,
        });

        if (centroids.length === 0) {
          logger.warn({ categoryIds }, 'No centroids found for categories');
          span.setAttributes({
            fallback: true,
            fallbackReason: 'no_centroids',
          });
          return this.getFallbackResults(
            periodMonths,
            limit,
            offset,
            startTime,
            options.excludeSourceIds
          );
        }

        const mode = centroids.length === 1 ? 'single' : 'multi-or';
        span.setAttribute('mode', mode);

        // Branch: single category vs multiple categories
        let qualifiedArticles: ScoredArticleWithMeta[];
        let candidateCount: number;
        let additionalLogInfo: Record<string, unknown> = {};
        let multiTimings: {
          perCategoryMs: number[];
          perCategoryResultCounts: number[];
          multiSettleWaitMs: number;
          multiMergeMs: number;
        } | null = null;

        if (centroids.length === 1) {
          const result = await this.filterArticlesSingleCategory(
            options,
            centroids[0]
          );
          if (result.candidates.length === 0) {
            logger.warn('No embedding candidates found');
            span.setAttributes({
              fallback: true,
              fallbackReason: 'no_candidates_single',
            });
            return this.getFallbackResults(
              periodMonths,
              limit,
              offset,
              startTime,
              options.excludeSourceIds
            );
          }
          qualifiedArticles = result.articles;
          candidateCount = result.candidates.length;
        } else {
          const result = await this.filterArticlesMultiCategory(
            options,
            centroids
          );
          if (result.mergedCount === 0) {
            span.setAttributes({
              fallback: true,
              fallbackReason: 'no_candidates_multi',
            });
            return this.getFallbackResults(
              periodMonths,
              limit,
              offset,
              startTime,
              options.excludeSourceIds
            );
          }
          qualifiedArticles = result.articles;
          candidateCount = result.mergedCount;
          multiTimings = {
            perCategoryMs: result.perCategoryMs,
            perCategoryResultCounts: result.perCategoryResultCounts,
            multiSettleWaitMs: result.multiSettleWaitMs,
            multiMergeMs: result.multiMergeMs,
          };
          additionalLogInfo = {
            candidatesPerCategory: result.perCategoryResultCounts,
          };
          span.setAttributes({
            multiSettleWaitMs: result.multiSettleWaitMs,
            multiMergeMs: result.multiMergeMs,
          });
        }

        // Apply requested sort + pagination (measure score aggregation time)
        const scoreAggStart = process.hrtime.bigint();
        const sortedArticles = sortArticles(
          qualifiedArticles,
          sortBy,
          sortOrder
        );
        const filtered = sortedArticles.slice(offset, offset + limit);
        const scoreAggregationMs = hrtimeDiffMs(scoreAggStart);

        span.setAttribute('scoreAggregationMs', scoreAggregationMs);

        const totalMatched = qualifiedArticles.length;
        const queryMs = Date.now() - startTime; // Preserved for backward compatibility

        logger.info(
          {
            timing: {
              centroids: centroidsFetchMs + centroidsLockWaitMs,
              scoreAggregation: scoreAggregationMs,
              ...(multiTimings
                ? {
                    multiSettleWait: multiTimings.multiSettleWaitMs,
                    multiMerge: multiTimings.multiMergeMs,
                    perCategoryMs: multiTimings.perCategoryMs,
                    perCategoryResultCounts:
                      multiTimings.perCategoryResultCounts,
                  }
                : {}),
            },
            categoryCount: categoryIds.length,
            candidateCount,
            queryMs,
            mode,
            ...additionalLogInfo,
          },
          'personalization.filter.timing'
        );

        logger.info(
          {
            categoryIds,
            candidateCount,
            filteredCount: filtered.length,
            totalMatched,
            queryMs,
            mode,
            ...additionalLogInfo,
          },
          'Personalized filtering completed'
        );

        return {
          articles: filtered,
          meta: {
            filterMode: 'category',
            appliedCategories: categoryIds,
            periodMonths,
            totalMatched,
            queryMs,
          },
        };
      } catch (error) {
        const errName = error instanceof Error ? error.name : 'UnknownError';
        span.setAttributes({
          fallback: true,
          fallbackReason: `error_${errName}`,
        });
        logger.error({ err: error, categoryIds }, 'Failed to filter articles');
        return this.getFallbackResults(
          periodMonths,
          limit,
          offset,
          startTime,
          options.excludeSourceIds
        );
      }
    });
  }

  /**
   * Get all active interest categories (sorted by sortOrder asc).
   */
  async getActiveCategories(): Promise<
    {
      id: string;
      slug: string;
      name: string;
      description: string | null;
      icon: string | null;
      sortOrder: number;
      isActive: boolean;
    }[]
  > {
    const categories = await this.db.interestCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    return categories.map((cat) => ({
      id: cat.id,
      slug: cat.slug,
      name: cat.name,
      description: cat.description,
      icon: cat.icon,
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
    }));
  }

  // ===========================================================================
  // Private Methods - Single/Multi Category Filtering
  // ===========================================================================

  /**
   * Filter articles using a single category centroid (original behavior).
   */
  private async filterArticlesSingleCategory(
    options: PersonalizedFilterOptions,
    centroid: CategoryCentroidRow
  ): Promise<{
    articles: ScoredArticleWithMeta[];
    candidates: EmbeddingCandidate[];
  }> {
    const { categoryIds, periodMonths } = options;

    const candidates = await getEmbeddingCandidates(
      this.db,
      centroid.centroid_embedding!,
      periodMonths,
      options.topK ?? DEFAULT_TOP_K_CANDIDATES,
      options.excludeSourceIds
    );

    if (candidates.length === 0) {
      return { articles: [], candidates: [] };
    }

    const candidatesWithTags = await checkTagMatches(
      this.db,
      candidates,
      categoryIds
    );
    const scored = calculateScores(candidatesWithTags);

    const qualifiedArticles = scored.filter(
      (a) => a.embeddingSimilarity >= DEFAULT_MIN_SIMILARITY
    );

    return { articles: qualifiedArticles, candidates };
  }

  /**
   * OR-based filtering for multiple categories.
   * Executes parallel searches per category and merges with max similarity.
   */
  private async filterArticlesMultiCategory(
    options: PersonalizedFilterOptions,
    centroids: CategoryCentroidRow[]
  ): Promise<{
    articles: ScoredArticleWithMeta[];
    mergedCount: number;
    /** @deprecated use perCategoryResultCounts */
    candidatesPerCategory: number[];
    perCategoryResultCounts: number[];
    perCategoryMs: number[];
    multiSettleWaitMs: number;
    multiMergeMs: number;
  }> {
    const { categoryIds, periodMonths, limit, offset = 0 } = options;

    // If topK is specified, treat it as total budget and derive perCategory from it
    const kPerCategory = options.topK
      ? Math.max(30, Math.floor(options.topK / centroids.length))
      : Math.max(
          50,
          Math.min(500, Math.ceil((limit + offset) / centroids.length) * 3)
        );

    logger.info(
      { categoryIds, kPerCategory, centroidCount: centroids.length },
      'Starting OR-based multi-category search'
    );

    // Build search promises; apply concurrency limit if maxConcurrency is specified
    const maxConcurrency = options.maxConcurrency;
    const concurrencyLimit =
      maxConcurrency && maxConcurrency > 0 && maxConcurrency < centroids.length
        ? pLimit(maxConcurrency)
        : null;

    // Wrap each per-category search with hrtime measurement
    const perCategoryStartTimes = centroids.map(() => process.hrtime.bigint());
    const searchPromises = centroids.map((c, i) => {
      const search = async () => {
        const result = await getEmbeddingCandidates(
          this.db,
          c.centroid_embedding!,
          periodMonths,
          kPerCategory,
          options.excludeSourceIds
        );
        return { result, elapsedMs: hrtimeDiffMs(perCategoryStartTimes[i]) };
      };
      return concurrencyLimit ? concurrencyLimit(search) : search();
    });

    const settleStart = process.hrtime.bigint();
    const settledResults = await Promise.allSettled(searchPromises);
    const multiSettleWaitMs = hrtimeDiffMs(settleStart);

    const categoryResults: EmbeddingCandidate[][] = [];
    const perCategoryMs: number[] = [];
    const failedCategories: number[] = [];

    settledResults.forEach((settled, index) => {
      if (settled.status === 'fulfilled') {
        categoryResults.push(settled.value.result);
        perCategoryMs.push(settled.value.elapsedMs);
      } else {
        failedCategories.push(index);
        categoryResults.push([]);
        perCategoryMs.push(0);
        logger.warn(
          { categoryIndex: index, err: settled.reason },
          'Category search failed, continuing with other categories'
        );
      }
    });

    if (failedCategories.length > 0) {
      logger.warn(
        {
          failedCount: failedCategories.length,
          totalCategories: centroids.length,
        },
        'Some category searches failed in OR search'
      );
    }

    // Merge results: keep max similarity per article
    const mergeStart = process.hrtime.bigint();
    const mergedMap = new Map<string, EmbeddingCandidate>();
    for (const results of categoryResults) {
      for (const candidate of results) {
        const existing = mergedMap.get(candidate.id);
        if (
          !existing ||
          candidate.embeddingSimilarity > existing.embeddingSimilarity
        ) {
          mergedMap.set(candidate.id, candidate);
        }
      }
    }
    const multiMergeMs = hrtimeDiffMs(mergeStart);

    const merged = Array.from(mergedMap.values());
    const perCategoryResultCounts = categoryResults.map((r) => r.length);

    if (merged.length === 0) {
      logger.warn('No candidates found in OR search');
      return {
        articles: [],
        mergedCount: 0,
        candidatesPerCategory: perCategoryResultCounts,
        perCategoryResultCounts,
        perCategoryMs,
        multiSettleWaitMs,
        multiMergeMs,
      };
    }

    const candidatesWithTags = await checkTagMatches(
      this.db,
      merged,
      categoryIds
    );
    const scored = calculateScores(candidatesWithTags);

    const qualifiedArticles = scored.filter(
      (a) => a.embeddingSimilarity >= DEFAULT_MIN_SIMILARITY
    );

    return {
      articles: qualifiedArticles,
      mergedCount: merged.length,
      candidatesPerCategory: perCategoryResultCounts,
      perCategoryResultCounts,
      perCategoryMs,
      multiSettleWaitMs,
      multiMergeMs,
    };
  }

  // ===========================================================================
  // Private Methods - Fallback
  // ===========================================================================

  /**
   * Return fallback results when filtering fails or no candidates found.
   */
  private async getFallbackResults(
    periodMonths: number,
    limit: number,
    offset: number,
    startTime: number,
    excludeSourceIds?: string[]
  ): Promise<{ articles: ScoredArticle[]; meta: PersonalizedFilterMeta }> {
    logger.info('Using fallback: recent articles by published date');

    const whereFilter = {
      isHidden: false,
      summaryComputedAt: { not: null },
      ...(periodMonths > 0
        ? {
            publishedAt: {
              gte: new Date(
                Date.now() - periodMonths * 30 * 24 * 60 * 60 * 1000
              ),
            },
          }
        : {}),
      ...(excludeSourceIds && excludeSourceIds.length > 0
        ? { sourceId: { notIn: excludeSourceIds } }
        : {}),
    };

    const [total, articles] = await Promise.all([
      this.db.article.count({ where: whereFilter }),
      this.db.article.findMany({
        where: whereFilter,
        orderBy: { publishedAt: 'desc' },
        skip: offset,
        take: limit,
        select: { id: true, publishedAt: true },
      }),
    ]);

    const scored: ScoredArticle[] = articles.map((a) => {
      const recency = calculateRecencyDecay(a.publishedAt);
      return {
        articleId: a.id,
        embeddingSimilarity: 0,
        tagBoost: 0,
        recencyDecay: recency * DEFAULT_SCORE_PARAMETERS.recencyBeta,
        finalScore: calculateFinalScore(0, false, recency),
      };
    });

    return {
      articles: scored,
      meta: {
        filterMode: 'category',
        appliedCategories: [],
        periodMonths,
        totalMatched: total,
        queryMs: Date.now() - startTime,
      },
    };
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const categoryFilterService = new CategoryFilterService();
