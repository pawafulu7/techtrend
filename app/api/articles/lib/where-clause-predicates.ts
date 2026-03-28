/**
 * Shared WHERE clause predicate functions for Articles API
 *
 * Provides common filter predicates used by both:
 * - app/api/articles/lib/query-builder.ts (ArticleWhereClauseBuilder)
 * - app/api/articles/list/query-helpers.ts (buildWhereClause)
 *
 * Each function mutates the provided `andConditions` array by pushing
 * Prisma.ArticleWhereInput conditions. This follows the `pushToAND` pattern
 * used in query-helpers.ts.
 *
 * NOTE: The following filters are intentionally NOT shared here:
 * - content filter: query-builder.ts uses `not: ''`, query-helpers.ts uses
 *   `notIn: ['', ' ', '\n', ...]` — an intentional difference in strictness.
 * - source filter: query-builder.ts is async (cache resolution), query-helpers.ts
 *   is sync — fundamentally different implementation strategies.
 * - category filter: query-builder.ts uses enum validation, query-helpers.ts uses
 *   normalizeArticleCategory() — different validation approaches.
 */

import type { Prisma } from '@prisma/client';
import {
  getDateRangeFilter,
  parseDateFromTo,
  getDateFieldForSort,
} from '@/app/lib/date-utils';

type ArticleWhereInput = Prisma.ArticleWhereInput;

// ---------------------------------------------------------------------------
// pushLowQualityFilter
// ---------------------------------------------------------------------------

/**
 * Push low-quality exclusion predicates into AND conditions when
 * `excludeLowQuality` is true.
 *
 * Filters out articles with:
 * - skipReason IN ('THIN_CONTENT', 'QUALITY_FAILED')
 * - qualityScore < 30 (scale 0–100)
 * PDF and SLIDE skip reasons are NOT excluded (valid content types).
 */
export function pushLowQualityFilter(
  andConditions: ArticleWhereInput[],
  excludeLowQuality: boolean
): void {
  if (!excludeLowQuality) return;

  andConditions.push(
    {
      OR: [
        { skipReason: null },
        {
          skipReason: {
            notIn: ['THIN_CONTENT' as const, 'QUALITY_FAILED' as const],
          },
        },
      ],
    },
    { qualityScore: { gte: 30 } }
  );
}

// ---------------------------------------------------------------------------
// pushProcessedFilter
// ---------------------------------------------------------------------------

/**
 * Push a summaryComputedAt not-null condition into AND conditions when
 * `excludeUnprocessed` is true. Excludes articles without processed summaries.
 */
export function pushProcessedFilter(
  andConditions: ArticleWhereInput[],
  excludeUnprocessed: boolean
): void {
  if (!excludeUnprocessed) return;

  andConditions.push({ summaryComputedAt: { not: null } });
}

// ---------------------------------------------------------------------------
// pushReadFilter
// ---------------------------------------------------------------------------

/**
 * Push a read-status condition into AND conditions.
 * Requires both `readFilter` and `userId` to be present; no-op otherwise.
 *
 * @param where - The top-level WHERE object (articleViews is set directly)
 * @param readFilter - 'read' | 'unread' | null/undefined
 * @param userId - Authenticated user's ID, or undefined for anonymous users
 */
export function pushReadFilter(
  where: ArticleWhereInput,
  readFilter: string | null | undefined,
  userId: string | undefined
): void {
  if (!readFilter || !userId) return;

  if (readFilter === 'unread') {
    where.articleViews = {
      none: {
        userId,
        isRead: true,
      },
    };
  } else if (readFilter === 'read') {
    where.articleViews = {
      some: {
        userId,
        isRead: true,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// pushTagFilter
// ---------------------------------------------------------------------------

/**
 * Push tag filter conditions into the AND conditions array or directly onto
 * the where object for OR-mode tag matching.
 *
 * Supports:
 * - Single tag via `tag` param (backward-compatible, treated as OR mode)
 * - Multiple tags via `tags` param (comma-separated)
 * - `tagMode` 'AND': articles must have ALL specified tags
 * - `tagMode` other (default): articles must have ANY specified tag (OR)
 *
 * All tag comparisons are case-insensitive.
 *
 * @param where - The top-level WHERE object (used for OR-mode tags assignment)
 * @param andConditions - AND conditions array (used for AND-mode tag conditions)
 * @param tag - Single tag name, or null/undefined
 * @param tags - Comma-separated tag names, or null/undefined
 * @param tagMode - 'AND' for all-tags matching, anything else for any-tag matching
 */
export function pushTagFilter(
  where: ArticleWhereInput,
  andConditions: ArticleWhereInput[],
  tag: string | null | undefined,
  tags: string | null | undefined,
  tagMode: string | null | undefined
): void {
  // Build unified tag list: `tags` takes precedence, `tag` is the fallback
  const tagList = tags
    ? tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    : tag
      ? [tag]
      : [];

  if (tagList.length === 0) return;

  if (tagMode === 'AND') {
    // AND search: articles must have all specified tags
    const tagConditions: ArticleWhereInput[] = tagList.map((tagName) => ({
      tags: {
        some: {
          name: { equals: tagName, mode: 'insensitive' as const },
        },
      },
    }));
    andConditions.push(...tagConditions);
  } else {
    // OR search: articles with any of the specified tags
    where.tags = {
      some: {
        OR: tagList.map((tagName) => ({
          name: { equals: tagName, mode: 'insensitive' as const },
        })),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// pushSearchFilter
// ---------------------------------------------------------------------------

/**
 * Push multi-keyword AND search conditions into AND conditions array.
 * Splits on whitespace (including full-width spaces \u3000) and requires
 * each keyword to appear in title or summary (case-insensitive).
 *
 * For a single keyword, pushes { OR: [title match, summary match] }.
 * For multiple keywords, pushes one such OR condition per keyword (AND logic).
 *
 * @param andConditions - AND conditions array to push into
 * @param search - Search string, or null/undefined for no-op
 */
export function pushSearchFilter(
  andConditions: ArticleWhereInput[],
  search: string | null | undefined
): void {
  if (!search) return;

  const keywords = search
    .trim()
    .split(/[\s\u3000]+/)
    .filter((k) => k.length > 0);

  if (keywords.length === 0) return;

  const keywordConditions: ArticleWhereInput[] = keywords.map((keyword) => ({
    OR: [
      { title: { contains: keyword, mode: 'insensitive' as const } },
      { summary: { contains: keyword, mode: 'insensitive' as const } },
    ],
  }));

  andConditions.push(...keywordConditions);
}

// ---------------------------------------------------------------------------
// pushDateRangeFilter
// ---------------------------------------------------------------------------

/**
 * Apply a date range filter directly onto the WHERE object.
 * Supports both preset date range strings and custom from/to dates.
 *
 * Priority: dateFrom/dateTo > dateRange preset.
 * If `dateRange` is 'all' or absent and no custom dates are provided, no-op.
 *
 * @param where - The top-level WHERE object (dateField is set directly)
 * @param sortBy - Sort field key, used to derive the date field name
 * @param dateRange - Preset range string (e.g. '7d', '30d'), or null/undefined
 * @param dateFrom - ISO date string for range start, or null/undefined
 * @param dateTo - ISO date string for range end, or null/undefined
 */
export function pushDateRangeFilter(
  where: ArticleWhereInput,
  sortBy: string | null | undefined,
  dateRange: string | null | undefined,
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined
): void {
  const dateField = getDateFieldForSort(sortBy ?? undefined);

  if (dateFrom || dateTo) {
    const customRange = parseDateFromTo(
      dateFrom ?? undefined,
      dateTo ?? undefined
    );
    if (customRange) {
      where[dateField] = {
        gte: customRange.from,
        lte: customRange.to,
      };
    }
  } else if (dateRange && dateRange !== 'all') {
    const startDate = getDateRangeFilter(dateRange);
    if (startDate) {
      const now = new Date();
      const validStartDate = startDate > now ? now : startDate;
      where[dateField] = {
        gte: validStartDate,
        lte: now,
      };
    }
  }
}
