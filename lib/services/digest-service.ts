/**
 * Digest Service
 *
 * Generates personalized article digests for users based on their
 * category preferences, trending articles, and missed high-quality content.
 */

import { PrismaClient } from '@/lib/prisma-exports';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { measureAsync, hrtimeDiffMs } from '@/lib/personalization/tracing';
import { RedisCache } from '@/lib/cache/redis-cache';
import {
  CategoryFilterService,
  categoryFilterService,
} from '@/lib/personalization/category-filter-service';
import type { InterestCategoryWithCount } from '@/lib/personalization/types';

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
  OVERFETCH_MULTIPLIER: 3,
  NEGATIVE_CACHE_TTL: 300, // 5 minutes
  DIGEST_TOP_K: 300,
  DIGEST_MAX_CONCURRENCY: 5,
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
  selectedCategories: string[];
  categories: InterestCategoryWithCount[];
}

// Internal type for section build results with error tracking
interface SectionResult {
  articles: DigestArticle[];
  ok: boolean;
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
  publishedAt: string;
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
    publishedAt: new Date(row.publishedAt),
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
      const cached = await measureAsync('digest.cache_get', async (span) => {
        try {
          const result = await this.cache.get<DigestResponse>(cacheKey);
          span.setAttribute('cacheHit', result !== null);
          return result;
        } catch (err) {
          span.setAttribute('cacheError', true);
          span.setAttribute(
            'cacheErrorMessage',
            err instanceof Error ? err.message : String(err)
          );
          throw err;
        }
      });
      if (cached) {
        logger.info({ userId, period }, 'Digest cache hit');
        // Restore Date objects from JSON serialization
        cached.sections.forEach((section) => {
          section.articles.forEach((article) => {
            article.publishedAt = new Date(article.publishedAt);
          });
        });
        return cached;
      }
    } catch (error) {
      logger.warn(
        { err: error, userId, period },
        'Digest cache read failed, proceeding without cache'
      );
    }

    // 2. Check if user has category preferences (digest scope)
    const preferenceCount = await this.db.userCategoryPreference.count({
      where: { userId, scope: 'digest' },
    });

    if (preferenceCount === 0) {
      const allCategories = await this.getActiveCategoriesWithTiming(userId);
      const emptyResponse: DigestResponse = {
        period,
        sections: [
          { type: 'personalized', title: 'あなたへのおすすめ', articles: [] },
          { type: 'mustRead', title: '必読記事', articles: [] },
          { type: 'missed', title: '見逃した注目記事', articles: [] },
        ],
        generatedAt: new Date().toISOString(),
        hasPreferences: false,
        selectedCategories: [],
        categories: allCategories,
      };
      return emptyResponse;
    }

    // 3. Get user's categoryIds (digest scope) and all active categories in parallel
    const [preferences, allCategories] = await Promise.all([
      this.db.userCategoryPreference.findMany({
        where: { userId, scope: 'digest' },
        select: { categoryId: true },
      }),
      this.getActiveCategoriesWithTiming(userId),
    ]);
    const categoryIds = preferences.map((p) => p.categoryId);

    // 4. Build sections in parallel with overfetch (dedupe after)
    const overfetchLimit =
      DIGEST_CONFIG.PERSONALIZED_RESULT_LIMIT *
      DIGEST_CONFIG.OVERFETCH_MULTIPLIER;
    const mustReadOverfetch =
      DIGEST_CONFIG.MUST_READ_LIMIT * DIGEST_CONFIG.OVERFETCH_MULTIPLIER;
    const missedOverfetch =
      DIGEST_CONFIG.MISSED_LIMIT * DIGEST_CONFIG.OVERFETCH_MULTIPLIER;

    const [personalizedResult, mustReadResult, missedResult] =
      await Promise.all([
        this.getPersonalizedArticles(
          userId,
          period,
          categoryIds,
          overfetchLimit
        ),
        this.getMustReadArticles(userId, period, mustReadOverfetch),
        this.getMissedArticles(userId, categoryIds, missedOverfetch),
      ]);

    // 5. Deduplicate in priority order: personalized > mustRead > missed
    const seenIds = new Set<string>();

    const deduped = (result: SectionResult, limit: number): DigestArticle[] => {
      const out: DigestArticle[] = [];
      for (const article of result.articles) {
        if (!seenIds.has(article.articleId) && out.length < limit) {
          seenIds.add(article.articleId);
          out.push(article);
        }
      }
      return out;
    };

    const personalizedArticles = deduped(
      personalizedResult,
      DIGEST_CONFIG.PERSONALIZED_RESULT_LIMIT
    );
    const mustReadArticles = deduped(
      mustReadResult,
      DIGEST_CONFIG.MUST_READ_LIMIT
    );
    const missedArticles = deduped(missedResult, DIGEST_CONFIG.MISSED_LIMIT);

    // 6. Build response
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
      selectedCategories: categoryIds,
      categories: allCategories,
    };

    // 7. Cache result
    // - Normal case (has articles): cache with default TTL
    // - Negative cache (all empty but all sections ok): short TTL (5 min)
    // - Fault case (any section failed): do NOT cache
    const hasAnyArticles = response.sections.some((s) => s.articles.length > 0);
    const allSectionsOk =
      personalizedResult.ok && mustReadResult.ok && missedResult.ok;

    if (hasAnyArticles || allSectionsOk) {
      const cacheTtl = hasAnyArticles
        ? undefined // use default CACHE_TTL
        : DIGEST_CONFIG.NEGATIVE_CACHE_TTL;
      try {
        await this.cache.set(cacheKey, response, cacheTtl);
      } catch (error) {
        logger.warn(
          { err: error, userId, period },
          'Digest cache write failed'
        );
      }
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
    categoryIds: string[],
    limit: number
  ): Promise<SectionResult> {
    try {
      // Get candidates via CategoryFilterService with digest-optimized topK
      const { articles: candidates, meta } =
        await this.filterService.filterArticles({
          categoryIds,
          periodMonths: 12,
          limit: DIGEST_CONFIG.PERSONALIZED_LIMIT,
          topK: DIGEST_CONFIG.DIGEST_TOP_K,
          maxConcurrency: DIGEST_CONFIG.DIGEST_MAX_CONCURRENCY,
        });

      // Detect if filterArticles fell back internally (centroid/embedding failure)
      const filterFellBack =
        categoryIds.length > 0 && (meta?.appliedCategories?.length ?? 0) === 0;

      if (candidates.length === 0) {
        return { articles: [], ok: !filterFellBack };
      }

      const candidateIds = candidates.map((c) => c.articleId);
      const cutoff = getPeriodCutoff(period);

      // Filter for unread articles within period, with source enabled and content not null
      const rows = await measureAsync('digest.post_filter', async (span) => {
        span.setAttribute('articleIdCount', candidateIds.length);
        const result = await this.db.$queryRaw<RawArticleRow[]>`
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
            AND a."isHidden" = false
            AND a."publishedAt" >= ${cutoff}
            AND NOT EXISTS (
              SELECT 1 FROM "ArticleView" av
              WHERE av."userId" = ${userId}
                AND av."articleId" = a.id
                AND av."isRead" = true
            )
          ORDER BY array_position(${candidateIds}, a.id)
          LIMIT ${limit}
        `;
        span.setAttribute('filteredCount', result.length);
        return result;
      });

      if (rows.length === 0) {
        return { articles: [], ok: !filterFellBack };
      }

      // Get matching category names for recommendation reason
      const categories = await this.db.interestCategory.findMany({
        where: { id: { in: categoryIds } },
        select: { name: true },
      });
      const categoryNames = categories.map((c) => c.name);
      const reason =
        categoryNames.length > 0
          ? `あなたの興味: ${categoryNames.slice(0, 2).join('・')}`
          : 'おすすめ記事';

      return {
        articles: rows.map((row) => toDigestArticle(row, reason)),
        ok: !filterFellBack,
      };
    } catch (error) {
      logger.error(
        { err: error, userId, period },
        'Failed to get personalized articles'
      );
      return { articles: [], ok: false };
    }
  }

  /**
   * Get must-read articles with highest viewer counts.
   * These are trending articles that many users have viewed.
   */
  private async getMustReadArticles(
    userId: string,
    period: DigestPeriod,
    limit: number
  ): Promise<SectionResult> {
    try {
      const cutoff = getPeriodCutoff(period);

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
          AND a."isHidden" = false
          AND NOT EXISTS (
            SELECT 1 FROM "ArticleView" av2
            WHERE av2."userId" = ${userId}
              AND av2."articleId" = a.id
              AND av2."isRead" = true
          )
        GROUP BY a.id
        ORDER BY viewer_count DESC
        LIMIT ${limit}
      `;

      return {
        articles: rows.map((row) =>
          toDigestArticle(
            row,
            `注目度トップ - ${Number(row.viewer_count)}人が閲覧`
          )
        ),
        ok: true,
      };
    } catch (error) {
      logger.error(
        { err: error, userId, period },
        'Failed to get must-read articles'
      );
      return { articles: [], ok: false };
    }
  }

  /**
   * Get missed high-quality articles in user's preferred categories.
   * These are articles the user hasn't read that have high quality scores.
   */
  private async getMissedArticles(
    userId: string,
    categoryIds: string[],
    limit: number
  ): Promise<SectionResult> {
    try {
      // missedセクションは常に過去MISSED_DAYS日間を対象（periodに依存しない）
      const cutoff = new Date(
        Date.now() - DIGEST_CONFIG.MISSED_DAYS * 24 * 60 * 60 * 1000
      );

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
          AND a."isHidden" = false
          AND a."qualityScore" >= ${DIGEST_CONFIG.QUALITY_THRESHOLD}
          AND tcm."categoryId" = ANY(${categoryIds})
          AND NOT EXISTS (
            SELECT 1 FROM "ArticleView" av
            WHERE av."userId" = ${userId}
              AND av."articleId" = a.id
              AND av."isRead" = true
          )
        ORDER BY a."qualityScore" DESC
        LIMIT ${limit}
      `;

      return {
        articles: rows.map((row) =>
          toDigestArticle(
            row,
            `見逃した注目 - 品質スコア ${Number(row.qualityScore)}`
          )
        ),
        ok: true,
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to get missed articles');
      return { articles: [], ok: false };
    }
  }

  /**
   * Fetch all active categories with timing instrumentation and error fallback.
   * Consolidated helper used in both the preference-empty path and the Promise.all path.
   */
  private async getActiveCategoriesWithTiming(
    userId: string
  ): Promise<
    Awaited<ReturnType<CategoryFilterService['getActiveCategories']>>
  > {
    const t0 = process.hrtime.bigint();
    try {
      const result = await this.filterService.getActiveCategories();
      logger.info(
        { timing: { activeCategoriesFetchMs: hrtimeDiffMs(t0) } },
        'getActiveCategories timing'
      );
      return result;
    } catch (error) {
      logger.warn(
        { err: error, userId },
        'getActiveCategories failed, falling back to empty list'
      );
      return [];
    }
  }

  /**
   * Invalidate digest cache for a user.
   * Called when user preferences change.
   */
  async invalidateUserCache(userId: string): Promise<void> {
    const periods: DigestPeriod[] = ['daily', 'weekly'];
    await Promise.all(
      periods.map((period) =>
        this.cache.delete(`digest:${userId}:${period}`).catch((error) => {
          logger.warn(
            { err: error, userId, period },
            'Failed to invalidate digest cache'
          );
        })
      )
    );
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const digestService = new DigestService();
