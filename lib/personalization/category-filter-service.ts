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
} from './types';
import { DEFAULT_SCORE_PARAMETERS } from './types';

// =============================================================================
// Configuration
// =============================================================================

/** Default number of embedding candidates to retrieve before scoring */
const DEFAULT_TOP_K_CANDIDATES = 200;

/** Minimum similarity threshold to include in results */
const DEFAULT_MIN_SIMILARITY = 0.32;

// =============================================================================
// Type Definitions for SQL Results
// =============================================================================

/** Raw embedding candidate from pgvector query */
type RawEmbeddingCandidate = {
  id: string;
  title: string;
  url: string;
  published_at: Date;
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
  sourceId: string | null;
  summary: string | null;
  thumbnailUrl: string | null;
  embeddingSimilarity: number;
};

/** Article with tag match information */
type CandidateWithTagMatch = EmbeddingCandidate & {
  hasTagMatch: boolean;
};

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

      // Compute combined centroid for multiple categories
      const combinedCentroid = computeWeightedCentroid(
        centroids.map((c) => c.centroid_embedding!)
      );

      // Step 1: Get embedding candidates
      const candidates = await this.getEmbeddingCandidates(
        combinedCentroid,
        periodMonths,
        DEFAULT_TOP_K_CANDIDATES
      );

      if (candidates.length === 0) {
        logger.warn('No embedding candidates found');
        return this.getFallbackResults(periodMonths, limit, offset, startTime);
      }

      // Step 2: Check tag matches for candidates
      const candidatesWithTags = await this.checkTagMatches(
        candidates,
        categoryIds
      );

      // Step 3: Calculate final scores and rank
      const scored = this.calculateScores(candidatesWithTags);

      // Filter by minimum similarity and apply pagination
      const filtered = scored
        .filter((a) => a.embeddingSimilarity >= DEFAULT_MIN_SIMILARITY)
        .slice(offset, offset + limit);

      const queryMs = Date.now() - startTime;

      logger.info(
        {
          categoryIds,
          candidateCount: candidates.length,
          filteredCount: filtered.length,
          queryMs,
        },
        'Personalized filtering completed'
      );

      return {
        articles: filtered,
        meta: {
          filterMode: 'category',
          appliedCategories: categoryIds,
          periodMonths,
          totalMatched: scored.filter(
            (a) => a.embeddingSimilarity >= DEFAULT_MIN_SIMILARITY
          ).length,
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
   * Get article counts per category.
   * Uses TagCategoryMapping to count articles with matching tags.
   */
  async getCategoryArticleCounts(): Promise<Map<string, number>> {
    const result = await this.db.$queryRaw<
      { category_id: string; count: bigint }[]
    >`
      SELECT
        tcm."categoryId" as category_id,
        COUNT(DISTINCT at."A") as count
      FROM "TagCategoryMapping" tcm
      INNER JOIN "_ArticleToTag" at ON at."B" = tcm."tagId"
      GROUP BY tcm."categoryId"
    `;

    const counts = new Map<string, number>();
    for (const row of result) {
      counts.set(row.category_id, Number(row.count));
    }

    return counts;
  }

  /**
   * Get all interest categories with article counts.
   */
  async getCategoriesWithCounts(): Promise<
    {
      id: string;
      slug: string;
      name: string;
      description: string | null;
      icon: string | null;
      sortOrder: number;
      isActive: boolean;
      articleCount: number;
    }[]
  > {
    const [categories, counts] = await Promise.all([
      this.db.interestCategory.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.getCategoryArticleCounts(),
    ]);

    return categories.map((cat) => ({
      id: cat.id,
      slug: cat.slug,
      name: cat.name,
      description: cat.description,
      icon: cat.icon,
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
      articleCount: counts.get(cat.id) ?? 0,
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
   * Get embedding candidates using pgvector similarity search.
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

    const result = await this.db.$queryRaw<RawEmbeddingCandidate[]>`
      SELECT
        a.id,
        a.title,
        a.url,
        a."publishedAt" as published_at,
        a."sourceId" as source_id,
        a.summary,
        a."thumbnailUrl" as thumbnail_url,
        1 - (ae.embedding <=> ${centroid}::vector) AS sim_emb
      FROM "Article" a
      INNER JOIN "ArticleEmbedding" ae ON a.id = ae."articleId"
      WHERE ae."embeddingKey" = 'summary'::"EmbeddingKey"
        ${periodFilter}
      ORDER BY ae.embedding <=> ${centroid}::vector
      LIMIT ${topK}
    `;

    return result.map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      publishedAt: row.published_at,
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
   * Calculate final scores for all candidates and sort by score.
   */
  private calculateScores(candidates: CandidateWithTagMatch[]): ScoredArticle[] {
    return candidates
      .map((c) => {
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
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore);
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

    const periodFilter =
      periodMonths > 0
        ? { publishedAt: { gte: new Date(Date.now() - periodMonths * 30 * 24 * 60 * 60 * 1000) } }
        : {};

    const articles = await this.db.article.findMany({
      where: periodFilter,
      orderBy: { publishedAt: 'desc' },
      skip: offset,
      take: limit,
      select: { id: true, publishedAt: true },
    });

    const scored: ScoredArticle[] = articles.map((a) => ({
      articleId: a.id,
      embeddingSimilarity: 0,
      tagBoost: 0,
      recencyDecay: calculateRecencyDecay(a.publishedAt) * DEFAULT_SCORE_PARAMETERS.recencyBeta,
      finalScore: calculateRecencyDecay(a.publishedAt),
    }));

    return {
      articles: scored,
      meta: {
        filterMode: 'category',
        appliedCategories: [],
        periodMonths,
        totalMatched: scored.length,
        queryMs: Date.now() - startTime,
      },
    };
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const categoryFilterService = new CategoryFilterService();
