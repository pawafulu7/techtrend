/**
 * Digest Service
 *
 * Generates personalized article digests for users based on their
 * category preferences, trending articles, and missed high-quality content.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger, sanitizeError } from '@/lib/logger';
import { RedisCache } from '@/lib/cache/redis-cache';
import {
  CategoryFilterService,
  categoryFilterService,
} from '@/lib/personalization/category-filter-service';

// =============================================================================
// Configuration
// =============================================================================

export const DIGEST_CONFIG = {
  QUALITY_THRESHOLD: 70, // qualityScore is 0-100 scale
  MISSED_DAYS: 7,
  PERSONALIZED_LIMIT: 50,
  CACHE_TTL: 1800, // 30 minutes
  MUST_READ_LIMIT: 10,
  MISSED_LIMIT: 10,
  PERSONALIZED_RESULT_LIMIT: 10,
} as const;

// =============================================================================
// Types
// =============================================================================

export type DigestPeriod = 'daily' | 'weekly';

export interface DigestArticle {
  articleId: string;
  title: string;
  url: string;
  summary: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date;
  qualityScore: number;
  sourceId: string | null;
  recommendationReason: string;
}

export interface DigestSection {
  type: 'personalized' | 'mustRead' | 'missed';
  title: string;
  articles: DigestArticle[];
}

export interface DigestResponse {
  period: DigestPeriod;
  sections: DigestSection[];
  generatedAt: string;
  hasPreferences: boolean;
}

// =============================================================================
// Internal Types for Raw SQL Results
// =============================================================================

interface RawArticleRow {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  thumbnail: string | null;
  publishedAt: Date;
  qualityScore: number;
  sourceId: string | null;
}

interface RawMustReadRow extends RawArticleRow {
  viewer_count: bigint;
}

// =============================================================================
// Helpers
// =============================================================================

function getPeriodCutoff(period: DigestPeriod): Date {
  const now = new Date();
  if (period === 'daily') {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}

function toDigestArticle(
  row: RawArticleRow,
  recommendationReason: string
): DigestArticle {
  return {
    articleId: row.id,
    title: row.title,
    url: row.url,
    summary: row.summary,
    thumbnailUrl: row.thumbnail,
    publishedAt: row.publishedAt,
    qualityScore: Number(row.qualityScore),
    sourceId: row.sourceId,
    recommendationReason,
  };
}

// =============================================================================
// Cache Instance
// =============================================================================

const digestCache = new RedisCache({
  ttl: DIGEST_CONFIG.CACHE_TTL,
  namespace: 'techtrend:digest',
});

// =============================================================================
// DigestService
// =============================================================================

export class DigestService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly cache: RedisCache = digestCache,
    private readonly filterService: CategoryFilterService = categoryFilterService
  ) {}

  /**
   * Get a personalized digest for a user.
   */
  async getDigest(
    userId: string,
    period: DigestPeriod
  ): Promise<DigestResponse> {
    // 1. Check cache
    const cacheKey = `digest:${userId}:${period}`;
    try {
      const cached = await this.cache.get<DigestResponse>(cacheKey);
      if (cached) {
        logger.info({ userId, period }, 'Digest cache hit');
        return cached;
      }
    } catch (error) {
      logger.warn(
        { error: sanitizeError(error), userId, period },
        'Digest cache read failed, proceeding without cache'
      );
    }

    // 2. Check if user has category preferences
    const preferenceCount = await this.db.userCategoryPreference.count({
      where: { userId },
    });

    if (preferenceCount === 0) {
      const emptyResponse: DigestResponse = {
        period,
        sections: [],
        generatedAt: new Date().toISOString(),
        hasPreferences: false,
      };
      return emptyResponse;
    }

    // 3. Get user's categoryIds
    const preferences = await this.db.userCategoryPreference.findMany({
      where: { userId },
      select: { categoryId: true },
    });
    const categoryIds = preferences.map((p) => p.categoryId);

    // 4. Build sections sequentially with deduplication
    const personalizedArticles = await this.getPersonalizedArticles(
      userId,
      period,
      categoryIds
    );
    const personalizedIds = new Set(
      personalizedArticles.map((a) => a.articleId)
    );

    const mustReadArticles = await this.getMustReadArticles(userId, period, [
      ...personalizedIds,
    ]);
    const mustReadIds = new Set(mustReadArticles.map((a) => a.articleId));

    const allExcludeIds = [...personalizedIds, ...mustReadIds];
    const missedArticles = await this.getMissedArticles(
      userId,
      period,
      categoryIds,
      allExcludeIds
    );

    // 5. Build response
    const response: DigestResponse = {
      period,
      sections: [
        {
          type: 'personalized',
          title: 'あなたへのおすすめ',
          articles: personalizedArticles,
        },
        {
          type: 'mustRead',
          title: '必読記事',
          articles: mustReadArticles,
        },
        {
          type: 'missed',
          title: '見逃した注目記事',
          articles: missedArticles,
        },
      ],
      generatedAt: new Date().toISOString(),
      hasPreferences: true,
    };

    // 6. Cache result
    try {
      await this.cache.set(cacheKey, response);
    } catch (error) {
      logger.warn(
        { error: sanitizeError(error), userId, period },
        'Digest cache write failed'
      );
    }

    return response;
  }

  /**
   * Get personalized articles based on user's category preferences.
   * Uses CategoryFilterService for embedding-based candidate retrieval,
   * then filters for unread articles within the period.
   */
  private async getPersonalizedArticles(
    userId: string,
    period: DigestPeriod,
    categoryIds: string[]
  ): Promise<DigestArticle[]> {
    try {
      // Get candidates via CategoryFilterService
      const { articles: candidates } = await this.filterService.filterArticles({
        categoryIds,
        periodMonths: 12,
        limit: DIGEST_CONFIG.PERSONALIZED_LIMIT,
      });

      if (candidates.length === 0) {
        return [];
      }

      const candidateIds = candidates.map((c) => c.articleId);
      const cutoff = getPeriodCutoff(period);

      // Filter for unread articles within period, with source enabled and content not null
      const rows = await this.db.$queryRaw<RawArticleRow[]>`
        SELECT
          a.id,
          a.title,
          a.url,
          a.summary,
          a.thumbnail,
          a."publishedAt",
          a."qualityScore",
          a."sourceId"
        FROM "Article" a
        JOIN "Source" s ON a."sourceId" = s.id AND s.enabled = true
        WHERE a.id = ANY(${candidateIds})
          AND a.content IS NOT NULL
          AND a."publishedAt" >= ${cutoff}
          AND NOT EXISTS (
            SELECT 1 FROM "ArticleView" av
            WHERE av."userId" = ${userId}
              AND av."articleId" = a.id
              AND av."isRead" = true
          )
        ORDER BY a."publishedAt" DESC
        LIMIT ${DIGEST_CONFIG.PERSONALIZED_RESULT_LIMIT}
      `;

      if (rows.length === 0) {
        return [];
      }

      // Get the first matching category name for recommendation reason
      const category = await this.db.interestCategory.findFirst({
        where: { id: { in: categoryIds } },
        select: { name: true },
      });
      const categoryName = category?.name ?? 'カスタム';

      return rows.map((row) =>
        toDigestArticle(row, `あなたの興味: ${categoryName}`)
      );
    } catch (error) {
      logger.error(
        { error: sanitizeError(error), userId, period },
        'Failed to get personalized articles'
      );
      return [];
    }
  }

  /**
   * Get must-read articles with highest viewer counts.
   * These are trending articles that many users have viewed.
   */
  private async getMustReadArticles(
    userId: string,
    period: DigestPeriod,
    excludeIds: string[]
  ): Promise<DigestArticle[]> {
    try {
      const cutoff = getPeriodCutoff(period);
      // Use empty array guard for ANY() - Prisma requires non-empty for some drivers
      const safeExcludeIds = excludeIds.length > 0 ? excludeIds : ['__none__'];

      const rows = await this.db.$queryRaw<RawMustReadRow[]>`
        SELECT
          a.id,
          a.title,
          a.url,
          a.summary,
          a.thumbnail,
          a."publishedAt",
          a."qualityScore",
          a."sourceId",
          COUNT(DISTINCT av."userId") as viewer_count
        FROM "Article" a
        JOIN "ArticleView" av ON a.id = av."articleId" AND av."viewedAt" IS NOT NULL
        JOIN "Source" s ON a."sourceId" = s.id AND s.enabled = true
        WHERE a."publishedAt" >= ${cutoff}
          AND a.content IS NOT NULL
          AND a.id != ALL(${safeExcludeIds})
          AND NOT EXISTS (
            SELECT 1 FROM "ArticleView" av2
            WHERE av2."userId" = ${userId}
              AND av2."articleId" = a.id
              AND av2."isRead" = true
          )
        GROUP BY a.id
        ORDER BY viewer_count DESC
        LIMIT ${DIGEST_CONFIG.MUST_READ_LIMIT}
      `;

      return rows.map((row) =>
        toDigestArticle(
          row,
          `注目度トップ - ${Number(row.viewer_count)}人が閲覧`
        )
      );
    } catch (error) {
      logger.error(
        { error: sanitizeError(error), userId, period },
        'Failed to get must-read articles'
      );
      return [];
    }
  }

  /**
   * Get missed high-quality articles in user's preferred categories.
   * These are articles the user hasn't read that have high quality scores.
   */
  private async getMissedArticles(
    userId: string,
    period: DigestPeriod,
    categoryIds: string[],
    excludeIds: string[]
  ): Promise<DigestArticle[]> {
    try {
      const cutoff = getPeriodCutoff(period);
      const safeExcludeIds = excludeIds.length > 0 ? excludeIds : ['__none__'];

      const rows = await this.db.$queryRaw<RawArticleRow[]>`
        SELECT DISTINCT
          a.id,
          a.title,
          a.url,
          a.summary,
          a.thumbnail,
          a."publishedAt",
          a."qualityScore",
          a."sourceId"
        FROM "Article" a
        JOIN "Source" s ON a."sourceId" = s.id AND s.enabled = true
        JOIN "_ArticleToTag" att ON a.id = att."A"
        JOIN "TagCategoryMapping" tcm ON att."B" = tcm."tagId"
        WHERE a."publishedAt" >= ${cutoff}
          AND a.content IS NOT NULL
          AND a."qualityScore" >= ${DIGEST_CONFIG.QUALITY_THRESHOLD}
          AND tcm."categoryId" = ANY(${categoryIds})
          AND a.id != ALL(${safeExcludeIds})
          AND NOT EXISTS (
            SELECT 1 FROM "ArticleView" av
            WHERE av."userId" = ${userId}
              AND av."articleId" = a.id
              AND av."isRead" = true
          )
        ORDER BY a."qualityScore" DESC
        LIMIT ${DIGEST_CONFIG.MISSED_LIMIT}
      `;

      return rows.map((row) =>
        toDigestArticle(
          row,
          `見逃した注目 - 品質スコア ${Number(row.qualityScore)}`
        )
      );
    } catch (error) {
      logger.error(
        { error: sanitizeError(error), userId, period },
        'Failed to get missed articles'
      );
      return [];
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const digestService = new DigestService();
