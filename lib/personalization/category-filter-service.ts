/**
 * Category Filter Service
 *
 * Embedding-first article filtering with tag boost and recency decay.
 * Uses pgvector for efficient similarity search against category centroids.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger, sanitizeError } from '@/lib/logger';
import type {
  PersonalizedFilterOptions,
  ScoredArticle,
  PersonalizedFilterMeta,
  ScoreParameters,
  PersonalizedSortBy,
} from './types';
import { DEFAULT_SCORE_PARAMETERS } from './types';

// =============================================================================
// Configuration
// =============================================================================

/** Legacy default for embedding candidates (kept for API compatibility; not used in threshold mode) */
const DEFAULT_TOP_K_CANDIDATES = 1000;

/** Minimum similarity threshold to include in results (derived from ScoreParameters) */
const DEFAULT_MIN_SIMILARITY = DEFAULT_SCORE_PARAMETERS.minSimilarityThreshold;

/** Safety cap for threshold-based filtering to prevent excessive memory use */
const DEFAULT_THRESHOLD_RESULT_LIMIT = 5000;

// =============================================================================
// Type Definitions for SQL Results
// =============================================================================

/** Raw embedding candidate from pgvector query */
type RawEmbeddingCandidate = {
  id: string;
  title: string;
  url: string;
  published_at: Date;
  created_at: Date;
  quality_score: number | null;
  bookmarks: number | null;
  user_votes: number | null;
  source_id: string | null;
  summary: string | null;
  thumbnail_url: string | null;
  sim_emb: number;
};

/** Parsed embedding candidate for scoring */
type EmbeddingCandidate = {
  id: string;
  title: string;
  url: string;
  publishedAt: Date;
  createdAt: Date;
  qualityScore: number;
  bookmarks: number;
  userVotes: number;
  sourceId: string | null;
  summary: string | null;
  thumbnailUrl: string | null;
  embeddingSimilarity: number;
};

/** Article with tag match information */
type CandidateWithTagMatch = EmbeddingCandidate & {
  hasTagMatch: boolean;
};

type ScoredArticleWithMeta = ScoredArticle &
  Pick<
    EmbeddingCandidate,
    'publishedAt' | 'createdAt' | 'qualityScore' | 'bookmarks' | 'userVotes'
  >;

/** Category centroid data from DB */
type CategoryCentroidRow = {
  id: string;
  slug: string;
  centroid_embedding: string | null;
};

// =============================================================================
// Pure Functions for Score Calculation
// =============================================================================

/**
 * Calculate recency decay using exponential decay function.
 * Formula: exp(-ln(2) * age_days / half_life_days)
 *
 * @param publishedAt - Article publication date
 * @param halfLifeDays - Days for decay to reach 0.5 (default: 365)
 * @returns Decay factor between 0 and 1
 */
export function calculateRecencyDecay(
  publishedAt: Date,
  halfLifeDays: number = DEFAULT_SCORE_PARAMETERS.halfLifeDays
): number {
  const ageDays = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 1.0;
  return Math.exp(-Math.LN2 * ageDays / halfLifeDays);
}

/**
 * Calculate final score from components.
 * Formula: sim_emb + alpha * tag_match + beta * recency_decay
 *
 * @param embeddingSimilarity - Cosine similarity to category centroid (0-1)
 * @param hasTagMatch - Whether article has matching category tag
 * @param recencyDecay - Recency decay factor (0-1)
 * @param params - Score parameters (alpha, beta)
 * @returns Final score
 */
export function calculateFinalScore(
  embeddingSimilarity: number,
  hasTagMatch: boolean,
  recencyDecay: number,
  params: ScoreParameters = DEFAULT_SCORE_PARAMETERS
): number {
  const tagBoost = hasTagMatch ? 1 : 0;
  return (
    embeddingSimilarity +
    params.tagBoostAlpha * tagBoost +
    params.recencyBeta * recencyDecay
  );
}

/**
 * Compute weighted average of multiple centroids.
 * Uses L2 normalization after averaging.
 *
 * NOTE: This function is kept for backward compatibility and testing,
 * but is no longer used for multi-category filtering (replaced by OR search
 * in filterArticlesMultiCategory). Will be used when AND-mode toggle is
 * implemented (Phase 5b).
 *
 * @param centroids - Array of centroid vectors (as strings from DB)
 * @param weights - Optional weights for each centroid (default: equal)
 * @returns Averaged and normalized centroid as string
 */
export function computeWeightedCentroid(
  centroids: string[],
  weights?: number[]
): string {
  if (centroids.length === 0) {
    throw new Error('No centroids provided');
  }

  if (centroids.length === 1) {
    return centroids[0];
  }

  // Parse centroid strings to number arrays
  const vectors = centroids.map((c) => {
    const parsed = c.replace(/^\[|\]$/g, '').split(',').map(Number);
    return parsed;
  });

  // Validate dimensions
  const dim = vectors[0].length;
  if (!vectors.every((v) => v.length === dim)) {
    throw new Error('Centroid dimensions do not match');
  }

  // Compute weighted average
  const effectiveWeights = weights ?? vectors.map(() => 1 / vectors.length);
  const weightSum = effectiveWeights.reduce((a, b) => a + b, 0);

  const averaged = new Array(dim).fill(0);
  for (let i = 0; i < vectors.length; i++) {
    const w = effectiveWeights[i] / weightSum;
    for (let j = 0; j < dim; j++) {
      averaged[j] += vectors[i][j] * w;
    }
  }

  // L2 normalize
  const norm = Math.sqrt(averaged.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < averaged.length; i++) {
      averaged[i] /= norm;
    }
  }

  return `[${averaged.join(',')}]`;
}

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
      const centroids = await this.getCategoryCentroids(categoryIds);

      if (centroids.length === 0) {
        logger.warn({ categoryIds }, 'No centroids found for categories');
        return this.getFallbackResults(periodMonths, limit, offset, startTime);
      }

      // Branch: single category vs multiple categories
      let qualifiedArticles: ScoredArticle[];
      let candidateCount: number;
      let additionalLogInfo: Record<string, unknown> = {};

      if (centroids.length === 1) {
        // Single category: use direct centroid search (original behavior)
        const result = await this.filterArticlesSingleCategory(options, centroids[0]);
        if (result.candidates.length === 0) {
          logger.warn('No embedding candidates found');
          return this.getFallbackResults(periodMonths, limit, offset, startTime);
        }
        qualifiedArticles = result.articles;
        candidateCount = result.candidates.length;
      } else {
        // Multiple categories: use OR-based search
        const result = await this.filterArticlesMultiCategory(options, centroids);
        if (result.mergedCount === 0) {
          return this.getFallbackResults(periodMonths, limit, offset, startTime);
        }
        qualifiedArticles = result.articles;
        candidateCount = result.mergedCount;
        additionalLogInfo = { candidatesPerCategory: result.candidatesPerCategory };
      }

      // Apply requested sort (defaults to personalization score)
      const sortedArticles = this.sortArticles(
        qualifiedArticles as ScoredArticleWithMeta[],
        sortBy,
        sortOrder
      );

      // Apply pagination
      const filtered = sortedArticles.slice(offset, offset + limit);

      // totalMatched is the count of articles that passed the similarity threshold
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
        { error: sanitizeError(error), categoryIds },
        'Failed to filter articles'
      );
      return this.getFallbackResults(periodMonths, limit, offset, startTime);
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
  // Private Methods - Layer 1: Embedding Candidate Extraction
  // ===========================================================================

  /**
   * Get category centroids from database.
   */
  private async getCategoryCentroids(
    categoryIds: string[]
  ): Promise<CategoryCentroidRow[]> {
    const result = await this.db.$queryRaw<CategoryCentroidRow[]>`
      SELECT
        id,
        slug,
        "centroidEmbedding"::text as centroid_embedding
      FROM "InterestCategory"
      WHERE id = ANY(${categoryIds}::text[])
        AND "centroidEmbedding" IS NOT NULL
    `;

    return result;
  }

  /**
   * Get embedding candidates using threshold-based similarity search.
   * Returns all articles that meet the similarity threshold up to a safety cap
   * to avoid unbounded memory usage.
   *
   * @param centroid - Category centroid embedding as string
   * @param periodMonths - Filter period in months (0 = all time)
   * @param topK - Maximum number of candidates to return (capped by DEFAULT_THRESHOLD_RESULT_LIMIT)
   */
  private async getEmbeddingCandidates(
    centroid: string,
    periodMonths: number,
    topK: number
  ): Promise<EmbeddingCandidate[]> {
    // Build period filter using calculated date parameter (safer than Prisma.raw)
    const cutoffDate =
      periodMonths > 0
        ? new Date(Date.now() - periodMonths * 30 * 24 * 60 * 60 * 1000)
        : null;
    const periodFilter = cutoffDate
      ? Prisma.sql`AND a."publishedAt" >= ${cutoffDate}`
      : Prisma.empty;

    // Use threshold-based filtering with topK limit
    // similarity = 1 - distance, so distance < (1 - threshold)
    const maxDistance = 1 - DEFAULT_MIN_SIMILARITY;

    // Apply guard rail: limit topK to safety cap
    const effectiveLimit = Math.min(topK, DEFAULT_THRESHOLD_RESULT_LIMIT);

    const result = await this.db.$queryRaw<RawEmbeddingCandidate[]>`
      SELECT
        a.id,
        a.title,
        a.url,
        a."publishedAt" as published_at,
        a."createdAt" as created_at,
        a."qualityScore" as quality_score,
        a."bookmarks" as bookmarks,
        a."userVotes" as user_votes,
        a."sourceId" as source_id,
        a.summary,
        a.thumbnail as thumbnail_url,
        1 - (ae.embedding <=> ${centroid}::vector) AS sim_emb
      FROM "Article" a
      INNER JOIN "ArticleEmbedding" ae ON a.id = ae."articleId"
      WHERE ae."embeddingKey" = 'summary'::"EmbeddingKey"
        AND a."summaryComputedAt" IS NOT NULL
        AND (ae.embedding <=> ${centroid}::vector) < ${maxDistance}
        ${periodFilter}
      ORDER BY ae.embedding <=> ${centroid}::vector
      LIMIT ${effectiveLimit}
    `;

    return result.map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      publishedAt: row.published_at,
      createdAt: row.created_at,
      qualityScore: row.quality_score ?? 0,
      bookmarks: row.bookmarks ?? 0,
      userVotes: row.user_votes ?? 0,
      sourceId: row.source_id,
      summary: row.summary,
      thumbnailUrl: row.thumbnail_url,
      embeddingSimilarity: row.sim_emb,
    }));
  }

  // ===========================================================================
  // Private Methods - Layer 2: Tag Match and Recency Calculation
  // ===========================================================================

  /**
   * Check which candidates have tag matches with the selected categories.
   */
  private async checkTagMatches(
    candidates: EmbeddingCandidate[],
    categoryIds: string[]
  ): Promise<CandidateWithTagMatch[]> {
    if (candidates.length === 0) {
      return [];
    }

    const articleIds = candidates.map((c) => c.id);

    // Get articles that have at least one tag matching the categories
    const matchingArticles = await this.db.$queryRaw<{ article_id: string }[]>`
      SELECT DISTINCT at."A" as article_id
      FROM "_ArticleToTag" at
      INNER JOIN "TagCategoryMapping" tcm ON at."B" = tcm."tagId"
      WHERE at."A" = ANY(${articleIds}::text[])
        AND tcm."categoryId" = ANY(${categoryIds}::text[])
    `;

    const matchingSet = new Set(matchingArticles.map((r) => r.article_id));

    return candidates.map((c) => ({
      ...c,
      hasTagMatch: matchingSet.has(c.id),
    }));
  }

  // ===========================================================================
  // Private Methods - Layer 3: Score Aggregation
  // ===========================================================================

  /**
   * Calculate final scores for all candidates.
   */
  private calculateScores(
    candidates: CandidateWithTagMatch[]
  ): ScoredArticleWithMeta[] {
    return candidates.map((c) => {
      const recencyDecay = calculateRecencyDecay(c.publishedAt);
      const finalScore = calculateFinalScore(
        c.embeddingSimilarity,
        c.hasTagMatch,
        recencyDecay
      );

      return {
        articleId: c.id,
        embeddingSimilarity: c.embeddingSimilarity,
        tagBoost: c.hasTagMatch ? DEFAULT_SCORE_PARAMETERS.tagBoostAlpha : 0,
        recencyDecay: recencyDecay * DEFAULT_SCORE_PARAMETERS.recencyBeta,
        finalScore,
        publishedAt: c.publishedAt,
        createdAt: c.createdAt,
        qualityScore: c.qualityScore,
        bookmarks: c.bookmarks,
        userVotes: c.userVotes,
      };
    });
  }

  /**
   * Apply requested sorting while preserving personalization defaults.
   */
  private sortArticles(
    candidates: ScoredArticleWithMeta[],
    sortBy: PersonalizedSortBy,
    sortOrder: 'asc' | 'desc'
  ): ScoredArticleWithMeta[] {
    const direction = sortOrder === 'asc' ? 1 : -1;

    // Secondary sort by finalScore for tie-breaking to ensure stable ordering
    const tieBreaker = (a: ScoredArticleWithMeta, b: ScoredArticleWithMeta): number =>
      (b.finalScore - a.finalScore); // Always descending for tie-break

    const compare = (a: ScoredArticleWithMeta, b: ScoredArticleWithMeta): number => {
      let primary: number;
      switch (sortBy) {
        case 'publishedAt':
          primary = (a.publishedAt.getTime() - b.publishedAt.getTime()) * direction;
          return primary !== 0 ? primary : tieBreaker(a, b);
        case 'createdAt':
          primary = (a.createdAt.getTime() - b.createdAt.getTime()) * direction;
          return primary !== 0 ? primary : tieBreaker(a, b);
        case 'qualityScore':
          primary = ((a.qualityScore ?? 0) - (b.qualityScore ?? 0)) * direction;
          return primary !== 0 ? primary : tieBreaker(a, b);
        case 'bookmarks':
          primary = ((a.bookmarks ?? 0) - (b.bookmarks ?? 0)) * direction;
          return primary !== 0 ? primary : tieBreaker(a, b);
        case 'userVotes':
          primary = ((a.userVotes ?? 0) - (b.userVotes ?? 0)) * direction;
          return primary !== 0 ? primary : tieBreaker(a, b);
        case 'finalScore':
        default:
          return (a.finalScore - b.finalScore) * direction;
      }
    };

    return [...candidates].sort(compare);
  }


  // ===========================================================================
  // Private Methods - Single/Multi Category Filtering
  // ===========================================================================

  /**
   * Filter articles using a single category centroid (original behavior).
   * Uses direct centroid search without weighted averaging.
   */
  private async filterArticlesSingleCategory(
    options: PersonalizedFilterOptions,
    centroid: CategoryCentroidRow
  ): Promise<{ articles: ScoredArticleWithMeta[]; candidates: EmbeddingCandidate[] }> {
    const { categoryIds, periodMonths } = options;

    // Get embedding candidates using single centroid directly (no averaging needed)
    const candidates = await this.getEmbeddingCandidates(
      centroid.centroid_embedding!,
      periodMonths,
      DEFAULT_TOP_K_CANDIDATES
    );

    if (candidates.length === 0) {
      return { articles: [], candidates: [] };
    }

    // Check tag matches
    const candidatesWithTags = await this.checkTagMatches(candidates, categoryIds);

    // Calculate scores
    const scored = this.calculateScores(candidatesWithTags);

    // Filter by minimum similarity
    const qualifiedArticles = scored.filter(
      (a) => a.embeddingSimilarity >= DEFAULT_MIN_SIMILARITY
    );

    return { articles: qualifiedArticles, candidates };
  }

  /**
   * OR-based filtering for multiple categories.
   * Executes parallel searches per category and merges with max similarity.
   * Uses Promise.allSettled to handle partial failures gracefully.
   */
  private async filterArticlesMultiCategory(
    options: PersonalizedFilterOptions,
    centroids: CategoryCentroidRow[]
  ): Promise<{ articles: ScoredArticleWithMeta[]; mergedCount: number; candidatesPerCategory: number[] }> {
    const { categoryIds, periodMonths, limit, offset = 0 } = options;

    // Calculate K per category with guard rails
    const kPerCategory = Math.max(
      50,
      Math.min(500, Math.ceil((limit + offset) / centroids.length) * 3)
    );

    logger.info(
      { categoryIds, kPerCategory, centroidCount: centroids.length },
      'Starting OR-based multi-category search'
    );

    // Parallel search per category using Promise.allSettled for graceful partial failure handling
    const searchPromises = centroids.map((c) =>
      this.getEmbeddingCandidates(c.centroid_embedding!, periodMonths, kPerCategory)
    );
    const settledResults = await Promise.allSettled(searchPromises);

    // Separate successful results from failures
    const categoryResults: EmbeddingCandidate[][] = [];
    const failedCategories: number[] = [];

    settledResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        categoryResults.push(result.value);
      } else {
        failedCategories.push(index);
        categoryResults.push([]); // Push empty array to maintain index alignment
        logger.warn(
          { categoryIndex: index, error: sanitizeError(result.reason) },
          'Category search failed, continuing with other categories'
        );
      }
    });

    // Log if any categories failed
    if (failedCategories.length > 0) {
      logger.warn(
        { failedCount: failedCategories.length, totalCategories: centroids.length },
        'Some category searches failed in OR search'
      );
    }

    // Merge results: keep max similarity per article
    const mergedMap = new Map<string, EmbeddingCandidate>();
    for (const results of categoryResults) {
      for (const candidate of results) {
        const existing = mergedMap.get(candidate.id);
        if (!existing || candidate.embeddingSimilarity > existing.embeddingSimilarity) {
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

    // Check tag matches against all categories (OR)
    const candidatesWithTags = await this.checkTagMatches(merged, categoryIds);

    // Calculate scores using max similarity
    const scored = this.calculateScores(candidatesWithTags);

    // Filter by minimum similarity
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
   * Falls back to recent articles ordered by published date.
   */
  private async getFallbackResults(
    periodMonths: number,
    limit: number,
    offset: number,
    startTime: number
  ): Promise<{ articles: ScoredArticle[]; meta: PersonalizedFilterMeta }> {
    logger.info('Using fallback: recent articles by published date');

    const whereFilter = {
      summaryComputedAt: { not: null },
      ...(periodMonths > 0
        ? { publishedAt: { gte: new Date(Date.now() - periodMonths * 30 * 24 * 60 * 60 * 1000) } }
        : {}),
    };

    // Keep pagination but also return the real total to avoid always reporting the limit value
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
