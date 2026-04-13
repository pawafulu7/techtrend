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

    try {
      // Step 0: Get category centroids
      const centroids = await getCategoryCentroids(this.db, categoryIds);

      if (centroids.length === 0) {
        logger.warn({ categoryIds }, 'No centroids found for categories');
        return this.getFallbackResults(
          periodMonths,
          limit,
          offset,
          startTime,
          options.excludeSourceIds
        );
      }

      // Branch: single category vs multiple categories
      let qualifiedArticles: ScoredArticleWithMeta[];
      let candidateCount: number;
      let additionalLogInfo: Record<string, unknown> = {};

      if (centroids.length === 1) {
        const result = await this.filterArticlesSingleCategory(
          options,
          centroids[0]
        );
        if (result.candidates.length === 0) {
          logger.warn('No embedding candidates found');
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
        additionalLogInfo = {
          candidatesPerCategory: result.candidatesPerCategory,
        };
      }

      // Apply requested sort
      const sortedArticles = sortArticles(qualifiedArticles, sortBy, sortOrder);

      // Apply pagination
      const filtered = sortedArticles.slice(offset, offset + limit);

      const totalMatched = qualifiedArticles.length;
      const queryMs = Date.now() - startTime;

      logger.info(
        {
          categoryIds,
          candidateCount,
          filteredCount: filtered.length,
          totalMatched,
          queryMs,
          mode: centroids.length === 1 ? 'single' : 'multi-or',
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
      logger.error(
        { err: error, categoryIds },
        'Failed to filter articles'
      );
      return this.getFallbackResults(
        periodMonths,
        limit,
        offset,
        startTime,
        options.excludeSourceIds
      );
    }
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
    candidatesPerCategory: number[];
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

    const searchPromises = centroids.map((c) => {
      const search = () =>
        getEmbeddingCandidates(
          this.db,
          c.centroid_embedding!,
          periodMonths,
          kPerCategory,
          options.excludeSourceIds
        );
      return concurrencyLimit ? concurrencyLimit(search) : search();
    });
    const settledResults = await Promise.allSettled(searchPromises);

    const categoryResults: EmbeddingCandidate[][] = [];
    const failedCategories: number[] = [];

    settledResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        categoryResults.push(result.value);
      } else {
        failedCategories.push(index);
        categoryResults.push([]);
        logger.warn(
          { categoryIndex: index, err: result.reason },
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

    const merged = Array.from(mergedMap.values());
    const candidatesPerCategory = categoryResults.map((r) => r.length);

    if (merged.length === 0) {
      logger.warn('No candidates found in OR search');
      return { articles: [], mergedCount: 0, candidatesPerCategory };
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
      candidatesPerCategory,
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
