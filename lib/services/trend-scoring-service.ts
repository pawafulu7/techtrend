import {
  Prisma,
  PrismaClient,
  TechMaturityStage,
  TechEntity,
  TechTrendScore,
} from '@prisma/client';
import logger from '@/lib/logger';
import {
  TrendScoreResult,
  TrendScoreComponents,
  SCORE_WEIGHTS,
  STAGE_THRESHOLDS,
} from '@/lib/types/trend-types';
import {
  calculateGrowthRate,
  redistributeWeights,
  sigmoidNormalize,
} from '@/lib/utils/growth-rate-calculator';

export class TrendScoringService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Map a TechTrendScore record + entity to the public TrendScoreResult DTO.
   */
  static toResult(
    record: TechTrendScore,
    entity: { id: string; name: string; type: string }
  ): TrendScoreResult {
    return {
      entityId: entity.id,
      entityName: entity.name,
      entityType: entity.type,
      score: record.score,
      components: {
        articleMentionGrowth: record.articleMentionGrowth,
        githubStarsGrowth: record.githubStarsGrowth,
        npmDownloadsGrowth: record.npmDownloadsGrowth,
        soQuestionsGrowth: record.soQuestionsGrowth,
      },
      stage: record.stage,
      calculatedAt: record.calculatedAt.toISOString(),
    };
  }

  async calculateScore(entityId: string): Promise<TrendScoreResult> {
    const entity = await this.prisma.techEntity.findUniqueOrThrow({
      where: { id: entityId },
    });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Article mention growth (using Article.publishedAt, not mention.createdAt)
    const [recentMentions, previousMentions] = await Promise.all([
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

    // External metrics growth rates
    const metricGrowths = await this.calculateExternalMetricGrowths(
      entityId,
      thirtyDaysAgo,
      sixtyDaysAgo
    );

    const articleMentionGrowth = calculateGrowthRate(
      recentMentions,
      previousMentions
    );

    // null -> 0 coercion is intentional: missing external metrics should not
    // contribute to RISING/DECLINING classification. The weighted sum requires
    // numeric values, and 0 ensures absent data has no effect on the score.
    const components: TrendScoreComponents = {
      articleMentionGrowth,
      githubStarsGrowth: metricGrowths.githubStarsGrowth ?? 0,
      npmDownloadsGrowth: metricGrowths.npmDownloadsGrowth ?? 0,
      soQuestionsGrowth: metricGrowths.soQuestionsGrowth ?? 0,
    };

    // Determine available components and redistribute weights
    const availableKeys = new Set<string>();
    availableKeys.add('ARTICLE_MENTION');
    if (metricGrowths.githubStarsGrowth !== null)
      availableKeys.add('GITHUB_STARS');
    if (metricGrowths.npmDownloadsGrowth !== null)
      availableKeys.add('NPM_DOWNLOADS');
    if (metricGrowths.soQuestionsGrowth !== null)
      availableKeys.add('SO_QUESTIONS');

    const weights = redistributeWeights(SCORE_WEIGHTS, availableKeys);

    const rawScore =
      (weights.ARTICLE_MENTION ?? 0) * components.articleMentionGrowth +
      (weights.GITHUB_STARS ?? 0) * components.githubStarsGrowth +
      (weights.NPM_DOWNLOADS ?? 0) * components.npmDownloadsGrowth +
      (weights.SO_QUESTIONS ?? 0) * components.soQuestionsGrowth;

    const score = Math.round(sigmoidNormalize(rawScore) * 100) / 100;
    const stage = this.classifyStage(entity, components);

    return {
      entityId: entity.id,
      entityName: entity.name,
      entityType: entity.type,
      score,
      components,
      stage,
      calculatedAt: now.toISOString(),
    };
  }

  async calculateAllScores(): Promise<{ calculated: number; errors: number }> {
    const entities = await this.prisma.techEntity.findMany({
      where: { mentionCount: { gt: 0 } },
      select: { id: true },
    });

    let calculated = 0;
    let errors = 0;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const CHUNK_SIZE = 5;
    for (let i = 0; i < entities.length; i += CHUNK_SIZE) {
      const chunk = entities.slice(i, i + CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map(async ({ id }) => {
          const result = await this.calculateScore(id);
          await this.prisma.techTrendScore.upsert({
            where: {
              entityId_calculatedAt: { entityId: id, calculatedAt: today },
            },
            create: {
              entityId: id,
              score: result.score,
              articleMentionGrowth: result.components.articleMentionGrowth,
              githubStarsGrowth: result.components.githubStarsGrowth,
              npmDownloadsGrowth: result.components.npmDownloadsGrowth,
              soQuestionsGrowth: result.components.soQuestionsGrowth,
              stage: result.stage,
              calculatedAt: today,
            },
            update: {
              score: result.score,
              articleMentionGrowth: result.components.articleMentionGrowth,
              githubStarsGrowth: result.components.githubStarsGrowth,
              npmDownloadsGrowth: result.components.npmDownloadsGrowth,
              soQuestionsGrowth: result.components.soQuestionsGrowth,
              stage: result.stage,
            },
          });
          return id;
        })
      );

      for (const settledResult of results) {
        if (settledResult.status === 'fulfilled') {
          calculated++;
        } else {
          const error = settledResult.reason;
          if (
            error instanceof Prisma.PrismaClientInitializationError ||
            error instanceof Prisma.PrismaClientRustPanicError
          ) {
            throw error; // Fail fast on infrastructure errors
          }
          logger.error({ error }, 'Failed to calculate score for entity');
          errors++;
        }
      }
    }

    return { calculated, errors };
  }

  async getLatestScores(options?: {
    stage?: TechMaturityStage;
    limit?: number;
    offset?: number;
    sort?: 'score' | 'name' | 'stage';
  }): Promise<{ scores: TrendScoreResult[]; total: number }> {
    const { stage, limit = 20, offset = 0, sort = 'score' } = options ?? {};

    // Get per-entity latest scores using a subquery for the max calculatedAt
    const latestDates = await this.prisma.techTrendScore.groupBy({
      by: ['entityId'],
      _max: { calculatedAt: true },
    });

    if (latestDates.length === 0) return { scores: [], total: 0 };

    // Build OR conditions to match each entity's latest date
    const entityDatePairs = latestDates
      .filter((d) => d._max.calculatedAt !== null)
      .map((d) => ({
        entityId: d.entityId,
        calculatedAt: d._max.calculatedAt!,
      }));

    if (entityDatePairs.length === 0) return { scores: [], total: 0 };

    const where = {
      OR: entityDatePairs,
      ...(stage ? { stage } : {}),
    };

    const orderBy =
      sort === 'score'
        ? { score: 'desc' as const }
        : sort === 'name'
          ? { entity: { name: 'asc' as const } }
          : { stage: 'asc' as const };

    const [records, total] = await Promise.all([
      this.prisma.techTrendScore.findMany({
        where,
        include: { entity: { select: { id: true, name: true, type: true } } },
        orderBy,
        take: Math.min(limit, 100),
        skip: offset,
      }),
      this.prisma.techTrendScore.count({ where }),
    ]);

    const scores: TrendScoreResult[] = records.map((r) =>
      TrendScoringService.toResult(r, r.entity)
    );

    return { scores, total };
  }

  async getScoreHistory(
    entityId: string,
    days: number = 90
  ): Promise<TechTrendScore[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setUTCHours(0, 0, 0, 0);

    return this.prisma.techTrendScore.findMany({
      where: {
        entityId,
        calculatedAt: { gte: since },
      },
      orderBy: { calculatedAt: 'asc' },
    });
  }

  private classifyStage(
    entity: TechEntity,
    components: TrendScoreComponents
  ): TechMaturityStage {
    const { articleMentionGrowth, githubStarsGrowth, npmDownloadsGrowth } =
      components;
    const {
      DECLINING_ARTICLE_GROWTH,
      EMERGING_MAX_AGE_DAYS,
      RISING_ARTICLE_GROWTH,
      RISING_EXTERNAL_GROWTH,
      ESTABLISHED_MENTION_COUNT,
    } = STAGE_THRESHOLDS;

    // Priority 1: DECLINING
    // Entities without external metrics have growth=0 (via null ?? 0),
    // so they cannot satisfy npmDownloadsGrowth < 0 || githubStarsGrowth < 0.
    // This is intentional: missing data should not trigger DECLINING.
    if (
      articleMentionGrowth < DECLINING_ARTICLE_GROWTH &&
      (npmDownloadsGrowth < 0 || githubStarsGrowth < 0)
    ) {
      return 'DECLINING';
    }

    // Priority 2: EMERGING
    const daysSinceFirstSeen = entity.firstSeenAt
      ? (Date.now() - entity.firstSeenAt.getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    if (
      daysSinceFirstSeen < EMERGING_MAX_AGE_DAYS &&
      articleMentionGrowth > 0 &&
      articleMentionGrowth <= RISING_ARTICLE_GROWTH
    ) {
      return 'EMERGING';
    }

    // Priority 3: RISING
    // Entities without external metrics have growth=0 (via null ?? 0),
    // so they cannot satisfy the RISING_EXTERNAL_GROWTH threshold.
    // This is intentional: missing data should not trigger RISING.
    if (
      articleMentionGrowth > RISING_ARTICLE_GROWTH &&
      (githubStarsGrowth > RISING_EXTERNAL_GROWTH ||
        npmDownloadsGrowth > RISING_EXTERNAL_GROWTH)
    ) {
      return 'RISING';
    }

    // Priority 4: ESTABLISHED
    if (
      entity.mentionCount >= ESTABLISHED_MENTION_COUNT &&
      Math.abs(articleMentionGrowth) < RISING_ARTICLE_GROWTH
    ) {
      return 'ESTABLISHED';
    }

    // Default: ESTABLISHED
    return 'ESTABLISHED';
  }

  private async calculateExternalMetricGrowths(
    entityId: string,
    thirtyDaysAgo: Date,
    sixtyDaysAgo: Date
  ): Promise<{
    githubStarsGrowth: number | null;
    npmDownloadsGrowth: number | null;
    soQuestionsGrowth: number | null;
  }> {
    const metrics = await this.prisma.externalMetric.findMany({
      where: {
        entityId,
        measuredAt: { gte: sixtyDaysAgo },
      },
      orderBy: { measuredAt: 'asc' },
    });

    const calcGrowth = (source: string): number | null => {
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

    return {
      githubStarsGrowth: calcGrowth('GITHUB_STARS'),
      npmDownloadsGrowth: calcGrowth('NPM_DOWNLOADS'),
      soQuestionsGrowth: calcGrowth('SO_QUESTIONS'),
    };
  }
}
