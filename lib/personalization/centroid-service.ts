/**
 * Centroid Service
 *
 * Computes category centroid embeddings from articles tagged with category-mapped tags.
 * Uses pgvector's AVG() aggregate for efficient SQL-level computation.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger, sanitizeError } from '@/lib/logger';
import type { CentroidComputationResult } from './types';

// =============================================================================
// Configuration
// =============================================================================

interface CentroidComputeOptions {
  /** Embedding key to use (default: 'summary') */
  embeddingKey?: string;
  /** Model name for embeddings (default: 'text-embedding-3-small') */
  model?: string;
  /** Embedding version (default: 1) */
  version?: number;
  /** Dry run mode - don't write to DB */
  dryRun?: boolean;
}

const DEFAULT_OPTIONS: Required<CentroidComputeOptions> = {
  embeddingKey: 'summary',
  model: 'text-embedding-3-small',
  version: 1,
  dryRun: false,
};

// =============================================================================
// Centroid Service
// =============================================================================

/**
 * Service for computing and updating category centroid embeddings.
 *
 * Uses a single CTE-based SQL query that:
 * 1. Joins TagCategoryMapping → _ArticleToTag → ArticleEmbedding
 * 2. Deduplicates articles per category (handles multi-tag articles)
 * 3. Computes AVG(embedding) using pgvector aggregate
 * 4. Updates InterestCategory.centroidEmbedding in one pass
 */
export class CentroidService {
  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * Compute and update centroids for all active categories.
   */
  async computeAllCentroids(
    options: CentroidComputeOptions = {}
  ): Promise<CentroidComputationResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const results: CentroidComputationResult[] = [];

    logger.info(
      { embeddingKey: opts.embeddingKey, model: opts.model, version: opts.version, dryRun: opts.dryRun },
      'Starting centroid computation for all categories'
    );

    try {
      // Get all active categories
      const categories = await this.db.interestCategory.findMany({
        where: { isActive: true },
        select: { id: true, slug: true },
      });

      logger.info({ categoryCount: categories.length }, 'Found active categories');

      // Compute centroids using single efficient query
      const centroids = await this.computeCentroidsQuery(opts);

      // Update each category
      for (const category of categories) {
        const centroidData = centroids.find((c) => c.categoryId === category.id);

        if (!centroidData || centroidData.sampleCount === 0) {
          logger.warn(
            { categoryId: category.id, slug: category.slug },
            'No articles found for category centroid'
          );
          results.push({
            categoryId: category.id,
            success: false,
            sampleCount: 0,
            error: 'No articles with embeddings found for this category',
          });
          continue;
        }

        if (!opts.dryRun) {
          await this.updateCategoryCentroid(category.id, centroidData.centroid);
        }

        logger.info(
          { categoryId: category.id, slug: category.slug, sampleCount: centroidData.sampleCount, dryRun: opts.dryRun },
          'Category centroid computed'
        );

        results.push({
          categoryId: category.id,
          success: true,
          sampleCount: centroidData.sampleCount,
        });
      }

      return results;
    } catch (error) {
      logger.error(
        { error: sanitizeError(error) },
        'Failed to compute centroids'
      );
      throw error;
    }
  }

  /**
   * Compute centroid for a single category.
   */
  async computeCategoryCentroid(
    categoryId: string,
    options: CentroidComputeOptions = {}
  ): Promise<CentroidComputationResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    logger.info(
      { categoryId, embeddingKey: opts.embeddingKey, dryRun: opts.dryRun },
      'Computing centroid for single category'
    );

    try {
      const centroids = await this.computeCentroidsQuery(opts, categoryId);
      const centroidData = centroids[0];

      if (!centroidData || centroidData.sampleCount === 0) {
        logger.warn({ categoryId }, 'No articles found for category centroid');
        return {
          categoryId,
          success: false,
          sampleCount: 0,
          error: 'No articles with embeddings found for this category',
        };
      }

      if (!opts.dryRun) {
        await this.updateCategoryCentroid(categoryId, centroidData.centroid);
      }

      logger.info(
        { categoryId, sampleCount: centroidData.sampleCount, dryRun: opts.dryRun },
        'Category centroid computed'
      );

      return {
        categoryId,
        success: true,
        sampleCount: centroidData.sampleCount,
      };
    } catch (error: unknown) {
      logger.error(
        { categoryId, error: sanitizeError(error) },
        'Failed to compute category centroid'
      );
      return {
        categoryId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute the centroid computation query.
   *
   * Uses a CTE to:
   * 1. Join TagCategoryMapping → _ArticleToTag → ArticleEmbedding
   * 2. Deduplicate articles per category (DISTINCT ON)
   * 3. Compute AVG(embedding) per category
   */
  private async computeCentroidsQuery(
    options: Required<CentroidComputeOptions>,
    categoryId?: string
  ): Promise<Array<{ categoryId: string; centroid: string; sampleCount: number }>> {
    const categoryFilter = categoryId
      ? Prisma.sql`AND tcm."categoryId" = ${categoryId}`
      : Prisma.empty;

    const result = await this.db.$queryRaw<
      Array<{ category_id: string; centroid: string; sample_count: bigint }>
    >`
      WITH article_embeddings AS (
        -- Get distinct articles per category with their embeddings
        SELECT DISTINCT ON (tcm."categoryId", ae."articleId")
          tcm."categoryId" as category_id,
          ae."articleId",
          ae.embedding
        FROM "TagCategoryMapping" tcm
        INNER JOIN "_ArticleToTag" at ON at."B" = tcm."tagId"
        INNER JOIN "ArticleEmbedding" ae ON ae."articleId" = at."A"
        WHERE ae."embeddingKey" = ${options.embeddingKey}::text::"EmbeddingKey"
          AND ae.model = ${options.model}
          AND ae.version = ${options.version}
          ${categoryFilter}
      )
      SELECT
        category_id,
        AVG(embedding)::text as centroid,
        COUNT(*) as sample_count
      FROM article_embeddings
      GROUP BY category_id
    `;

    return result.map((row) => ({
      categoryId: row.category_id,
      centroid: row.centroid,
      sampleCount: Number(row.sample_count),
    }));
  }

  /**
   * Update a category's centroid embedding.
   */
  private async updateCategoryCentroid(
    categoryId: string,
    centroidVector: string
  ): Promise<void> {
    await this.db.$executeRaw`
      UPDATE "InterestCategory"
      SET
        "centroidEmbedding" = ${centroidVector}::vector,
        "centroidComputedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE id = ${categoryId}
    `;
  }

  /**
   * Get statistics about current centroid state.
   */
  async getCentroidStats(): Promise<{
    totalCategories: number;
    categoriesWithCentroid: number;
    categoriesWithoutCentroid: number;
    oldestCentroid: Date | null;
    newestCentroid: Date | null;
  }> {
    const [total, withCentroid, oldest, newest] = await Promise.all([
      this.db.interestCategory.count({ where: { isActive: true } }),
      this.db.interestCategory.count({
        where: { isActive: true, centroidComputedAt: { not: null } },
      }),
      this.db.interestCategory.findFirst({
        where: { isActive: true, centroidComputedAt: { not: null } },
        orderBy: { centroidComputedAt: 'asc' },
        select: { centroidComputedAt: true },
      }),
      this.db.interestCategory.findFirst({
        where: { isActive: true, centroidComputedAt: { not: null } },
        orderBy: { centroidComputedAt: 'desc' },
        select: { centroidComputedAt: true },
      }),
    ]);

    return {
      totalCategories: total,
      categoriesWithCentroid: withCentroid,
      categoriesWithoutCentroid: total - withCentroid,
      oldestCentroid: oldest?.centroidComputedAt ?? null,
      newestCentroid: newest?.centroidComputedAt ?? null,
    };
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const centroidService = new CentroidService();
