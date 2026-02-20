import { Prisma, PrismaClient, MetricSource } from '@prisma/client';
import logger from '@/lib/logger';
import {
  AxisResult,
  HEALTH_WEIGHTS,
  HealthScoreResult,
  HealthHistoryPoint,
} from '@/app/tech-map/health/types';
import {
  calculateGrowthRate,
  redistributeWeights,
  sigmoidNormalize,
} from '@/lib/utils/growth-rate-calculator';

interface ComputeHealthResult {
  axes: Record<string, AxisResult>;
  overallHealth: number;
}

export class TechHealthService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Pure computation: calculate health axes for a single entity.
   * Does NOT persist anything.
   */
  async computeHealth(entityId: string): Promise<ComputeHealthResult> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [
      articleAttention,
      adoptionBreadth,
      communityActivity,
      developmentVelocity,
    ] = await Promise.all([
      this.calcArticleAttention(entityId, thirtyDaysAgo, sixtyDaysAgo),
      this.calcAdoptionBreadth(entityId),
      this.calcCommunityActivity(entityId, thirtyDaysAgo, sixtyDaysAgo),
      this.calcDevelopmentVelocity(entityId, thirtyDaysAgo, sixtyDaysAgo),
    ]);

    const axes: Record<string, AxisResult> = {
      articleAttention,
      adoptionBreadth,
      communityActivity,
      developmentVelocity,
    };

    const overallHealth = this.calculateOverallHealth(axes);

    return { axes, overallHealth };
  }

  /**
   * Persist a health snapshot via upsert (unique on entityId + calculatedAt).
   */
  async saveSnapshot(
    entityId: string,
    result: ComputeHealthResult,
    calculatedAt: Date
  ): Promise<void> {
    await this.prisma.techHealthSnapshot.upsert({
      where: {
        entityId_calculatedAt: { entityId, calculatedAt },
      },
      create: {
        entityId,
        communityActivity: result.axes.communityActivity.value,
        developmentVelocity: result.axes.developmentVelocity.value,
        articleAttention: result.axes.articleAttention.value,
        adoptionBreadth: result.axes.adoptionBreadth.value,
        overallHealth: result.overallHealth,
        calculatedAt,
      },
      update: {
        communityActivity: result.axes.communityActivity.value,
        developmentVelocity: result.axes.developmentVelocity.value,
        articleAttention: result.axes.articleAttention.value,
        adoptionBreadth: result.axes.adoptionBreadth.value,
        overallHealth: result.overallHealth,
      },
    });
  }

  /**
   * Orchestrator: compute health + save snapshot for a single entity.
   */
  async calculateHealth(
    entityId: string,
    calculatedAt?: Date
  ): Promise<ComputeHealthResult> {
    const result = await this.computeHealth(entityId);

    const now = new Date();
    const date =
      calculatedAt ??
      new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );

    await this.saveSnapshot(entityId, result, date);
    return result;
  }

  /**
   * Batch: calculate health for all entities with mentionCount > 0.
   * Processes in chunks of 5 using Promise.allSettled.
   */
  async calculateAllHealth(): Promise<{ calculated: number; errors: number }> {
    const now = new Date();
    const calculatedAt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );

    const entities = await this.prisma.techEntity.findMany({
      where: { mentionCount: { gt: 0 } },
      select: { id: true },
    });

    let calculated = 0;
    let errors = 0;

    const CHUNK_SIZE = 5;
    for (let i = 0; i < entities.length; i += CHUNK_SIZE) {
      const chunk = entities.slice(i, i + CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map(({ id }) => this.calculateHealth(id, calculatedAt))
      );

      for (let j = 0; j < results.length; j++) {
        const settledResult = results[j];
        const entityId = chunk[j].id;
        if (settledResult.status === 'fulfilled') {
          calculated++;
        } else {
          const error = settledResult.reason;
          if (
            error instanceof Prisma.PrismaClientInitializationError ||
            error instanceof Prisma.PrismaClientRustPanicError
          ) {
            throw error;
          }
          logger.error(
            { error, entityId },
            'Failed to calculate health for entity'
          );
          errors++;
        }
      }
    }

    return { calculated, errors };
  }

  /**
   * List latest health snapshots with filter/sort/pagination.
   */
  async getLatestHealth(options?: {
    sort?:
      | 'overallHealth'
      | 'communityActivity'
      | 'developmentVelocity'
      | 'articleAttention'
      | 'adoptionBreadth';
    order?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
    search?: string;
    minScore?: number;
    maxScore?: number;
  }): Promise<{ data: HealthScoreResult[]; total: number }> {
    const {
      sort = 'overallHealth',
      order = 'desc',
      limit = 20,
      offset = 0,
      search,
      minScore,
      maxScore,
    } = options ?? {};

    // Get per-entity latest dates
    const latestDates = await this.prisma.techHealthSnapshot.groupBy({
      by: ['entityId'],
      _max: { calculatedAt: true },
    });

    if (latestDates.length === 0) return { data: [], total: 0 };

    const entityDatePairs = latestDates
      .filter((d) => d._max.calculatedAt !== null)
      .map((d) => ({
        entityId: d.entityId,
        calculatedAt: d._max.calculatedAt!,
      }));

    if (entityDatePairs.length === 0) return { data: [], total: 0 };

    if (entityDatePairs.length > 1000) {
      logger.warn(
        { count: entityDatePairs.length },
        'getLatestHealth: OR clause has >1000 entity-date pairs; consider migrating to a subquery or window function'
      );
    }

    // TODO: The OR-based approach may not scale beyond ~1000 entities.
    // Consider migrating to a raw query with a window function
    // (e.g. ROW_NUMBER() OVER (PARTITION BY entityId ORDER BY calculatedAt DESC))
    // or a lateral join / subquery to fetch the latest snapshot per entity.
    const where: Prisma.TechHealthSnapshotWhereInput = {
      OR: entityDatePairs,
      ...(minScore !== undefined || maxScore !== undefined
        ? {
            overallHealth: {
              ...(minScore !== undefined ? { gte: minScore } : {}),
              ...(maxScore !== undefined ? { lte: maxScore } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            entity: {
              name: { contains: search, mode: 'insensitive' as const },
            },
          }
        : {}),
    };

    const orderBy =
      sort === 'overallHealth'
        ? { overallHealth: order }
        : sort === 'communityActivity'
          ? { communityActivity: order }
          : sort === 'developmentVelocity'
            ? { developmentVelocity: order }
            : sort === 'articleAttention'
              ? { articleAttention: order }
              : { adoptionBreadth: order };

    const [records, total] = await Promise.all([
      this.prisma.techHealthSnapshot.findMany({
        where,
        include: { entity: { select: { id: true, name: true, type: true } } },
        orderBy,
        take: Math.min(limit, 50),
        skip: offset,
      }),
      this.prisma.techHealthSnapshot.count({ where }),
    ]);

    const data: HealthScoreResult[] = records.map((r) => ({
      entityId: r.entity.id,
      entityName: r.entity.name,
      entityType: r.entity.type,
      axes: {
        communityActivity: {
          value: r.communityActivity,
          available: r.communityActivity > 0,
        },
        developmentVelocity: {
          value: r.developmentVelocity,
          available: r.developmentVelocity > 0,
        },
        articleAttention: {
          value: r.articleAttention,
          available: r.articleAttention > 0,
        },
        adoptionBreadth: {
          value: r.adoptionBreadth,
          available: r.adoptionBreadth > 0,
        },
      },
      overallHealth: r.overallHealth,
      calculatedAt: r.calculatedAt.toISOString(),
    }));

    return { data, total };
  }

  /**
   * Look up a tech entity by ID. Returns null if not found.
   */
  async getEntity(
    id: string
  ): Promise<{ id: string; name: string; type: string } | null> {
    return this.prisma.techEntity.findUnique({
      where: { id },
      select: { id: true, name: true, type: true },
    });
  }

  /**
   * Time series history for a single entity.
   */
  async getHealthHistory(
    entityId: string,
    days: number = 30
  ): Promise<HealthHistoryPoint[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setUTCHours(0, 0, 0, 0);

    const records = await this.prisma.techHealthSnapshot.findMany({
      where: {
        entityId,
        calculatedAt: { gte: since },
      },
      orderBy: { calculatedAt: 'asc' },
    });

    return records.map((r) => ({
      calculatedAt: r.calculatedAt.toISOString(),
      communityActivity: r.communityActivity,
      developmentVelocity: r.developmentVelocity,
      articleAttention: r.articleAttention,
      adoptionBreadth: r.adoptionBreadth,
      overallHealth: r.overallHealth,
    }));
  }

  // ---------------------------------------------------------------------------
  // Private axis calculations
  // ---------------------------------------------------------------------------

  private async calcArticleAttention(
    entityId: string,
    thirtyDaysAgo: Date,
    sixtyDaysAgo: Date
  ): Promise<AxisResult> {
    const [recentCount, previousCount] = await Promise.all([
      this.prisma.articleTechMention.count({
        where: {
          entityId,
          article: { publishedAt: { gte: thirtyDaysAgo } },
        },
      }),
      this.prisma.articleTechMention.count({
        where: {
          entityId,
          article: { publishedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
        },
      }),
    ]);

    const anyMentions = recentCount > 0 || previousCount > 0;
    if (!anyMentions) {
      return { value: 0, available: false };
    }

    const growthRate = calculateGrowthRate(recentCount, previousCount);
    const value = Math.round(sigmoidNormalize(growthRate) * 100) / 100;
    return { value, available: true };
  }

  private async calcAdoptionBreadth(entityId: string): Promise<AxisResult> {
    const totalSourceGroups = await this.prisma.sourceGroup.count();
    if (totalSourceGroups === 0) {
      return { value: 0, available: false };
    }

    // Count unique source groups via DB-side COUNT(DISTINCT) for efficiency
    const result = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT s."groupId") as count
      FROM "ArticleTechMention" atm
      JOIN "Article" a ON a.id = atm."articleId"
      JOIN "Source" s ON s.id = a."sourceId"
      WHERE atm."entityId" = ${entityId}
        AND s."groupId" IS NOT NULL
    `;

    const entityGroupCount = Number(result[0].count);
    if (entityGroupCount === 0) {
      return { value: 0, available: false };
    }

    const value =
      Math.round((entityGroupCount / totalSourceGroups) * 100 * 100) / 100;
    return { value, available: true };
  }

  private async calcCommunityActivity(
    entityId: string,
    thirtyDaysAgo: Date,
    sixtyDaysAgo: Date
  ): Promise<AxisResult> {
    const metrics = await this.prisma.externalMetric.findMany({
      where: {
        entityId,
        source: { in: [MetricSource.GITHUB_STARS, MetricSource.SO_QUESTIONS] },
        measuredAt: { gte: sixtyDaysAgo },
      },
      orderBy: { measuredAt: 'asc' },
    });

    const calcGrowth = (source: MetricSource): number | null => {
      const sourceMetrics = metrics.filter((m) => m.source === source);
      const recent = sourceMetrics.filter((m) => m.measuredAt >= thirtyDaysAgo);
      const previous = sourceMetrics.filter(
        (m) => m.measuredAt < thirtyDaysAgo
      );

      if (recent.length < 1 || previous.length < 1) return null;

      const recentAvg = recent.reduce((s, m) => s + m.value, 0) / recent.length;
      const previousAvg =
        previous.reduce((s, m) => s + m.value, 0) / previous.length;
      return calculateGrowthRate(recentAvg, previousAvg);
    };

    const ghGrowth = calcGrowth(MetricSource.GITHUB_STARS);
    const soGrowth = calcGrowth(MetricSource.SO_QUESTIONS);

    if (ghGrowth !== null && soGrowth !== null) {
      const avgGrowth = (ghGrowth + soGrowth) / 2;
      const value = Math.round(sigmoidNormalize(avgGrowth) * 100) / 100;
      return { value, available: true };
    }

    if (ghGrowth !== null) {
      const value = Math.round(sigmoidNormalize(ghGrowth) * 100) / 100;
      return { value, available: true };
    }

    if (soGrowth !== null) {
      const value = Math.round(sigmoidNormalize(soGrowth) * 100) / 100;
      return { value, available: true };
    }

    return { value: 0, available: false };
  }

  private async calcDevelopmentVelocity(
    entityId: string,
    thirtyDaysAgo: Date,
    sixtyDaysAgo: Date
  ): Promise<AxisResult> {
    const metrics = await this.prisma.externalMetric.findMany({
      where: {
        entityId,
        source: MetricSource.NPM_DOWNLOADS,
        measuredAt: { gte: sixtyDaysAgo },
      },
      orderBy: { measuredAt: 'asc' },
    });

    if (metrics.length === 0) {
      return { value: 0, available: false };
    }

    const recent = metrics.filter((m) => m.measuredAt >= thirtyDaysAgo);
    const previous = metrics.filter((m) => m.measuredAt < thirtyDaysAgo);

    if (recent.length < 1 || previous.length < 1) {
      return { value: 0, available: false };
    }

    const recentAvg = recent.reduce((s, m) => s + m.value, 0) / recent.length;
    const previousAvg =
      previous.reduce((s, m) => s + m.value, 0) / previous.length;
    const growthRate = calculateGrowthRate(recentAvg, previousAvg);
    const value = Math.round(sigmoidNormalize(growthRate) * 100) / 100;

    return { value, available: true };
  }

  /**
   * Calculate overall health using weighted sum.
   * Only axes with available === true participate.
   * Weights of unavailable axes are redistributed proportionally.
   */
  private calculateOverallHealth(axes: Record<string, AxisResult>): number {
    const availableKeys = new Set<string>();
    for (const [axisKey, axisResult] of Object.entries(axes)) {
      if (axisResult.available && axisKey in HEALTH_WEIGHTS) {
        availableKeys.add(axisKey);
      }
    }

    if (availableKeys.size === 0) return 0;

    const weights = redistributeWeights(HEALTH_WEIGHTS, availableKeys);

    let score = 0;
    for (const [axisKey, axisResult] of Object.entries(axes)) {
      if (weights[axisKey] !== undefined) {
        score += weights[axisKey] * axisResult.value;
      }
    }

    return Math.round(score * 100) / 100;
  }
}
