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

import { z } from 'zod';
import { SkipReason, type Prisma } from '@/lib/prisma-exports';
import {
  getDateRangeFilter,
  parseDateFromTo,
  getDateFieldForSort,
} from '@/app/lib/date-utils';
import logger from '@/lib/logger';
import { escapeLikePattern } from '@/lib/utils/like-pattern';
import { findTagIdGroupsByNames } from '@/lib/services/tag-service';
import {
  MAX_TAG_FILTER_COUNT,
  MAX_TAG_NAME_LENGTH,
} from '@/lib/constants/tag-filter';
import {
  MAX_SEARCH_KEYWORDS,
  MAX_SEARCH_QUERY_LENGTH,
} from '@/lib/constants/search-query';

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
            notIn: [SkipReason.THIN_CONTENT, SkipReason.QUALITY_FAILED],
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
 * Set summaryComputedAt not-null condition directly onto the WHERE object when
 * `excludeUnprocessed` is true. Excludes articles without processed summaries.
 */
export function pushProcessedFilter(
  where: ArticleWhereInput,
  excludeUnprocessed: boolean
): void {
  if (!excludeUnprocessed) return;

  where.summaryComputedAt = { not: null };
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
 * `tag` / `tags` クエリから、絞り込むタグ名の一覧を作る。
 * `tag`（1 つ）が優先。`tags` はカンマ区切りで、空の要素は捨てる。
 */
export function parseTagList(
  tag: string | null | undefined,
  tags: string | null | undefined
): string[] {
  if (tag) return [tag];
  if (!tags) return [];
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export { MAX_TAG_FILTER_COUNT, MAX_TAG_NAME_LENGTH };

/** 分割する前の `tags` の長さの上限 */
const MAX_TAGS_PARAM_LENGTH = MAX_TAG_FILTER_COUNT * (MAX_TAG_NAME_LENGTH + 1);

const tagFilterSchema = z
  .object({
    tag: z.string().nullish(),
    tags: z
      .string()
      .max(MAX_TAGS_PARAM_LENGTH, {
        message: `tags must be at most ${MAX_TAGS_PARAM_LENGTH} characters`,
      })
      .nullish(),
  })
  .superRefine(({ tag, tags }, ctx) => {
    // 実際に使う方（tag が優先）だけを数える
    const tagList = parseTagList(tag, tags);
    if (tagList.length > MAX_TAG_FILTER_COUNT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tags'],
        message: `tags must contain at most ${MAX_TAG_FILTER_COUNT} items`,
      });
    }
    if (tagList.some((name) => name.length > MAX_TAG_NAME_LENGTH)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [tag ? 'tag' : 'tags'],
        message: `each tag must be at most ${MAX_TAG_NAME_LENGTH} characters`,
      });
    }
  });

/**
 * `tag` / `tags` クエリを検証する。問題があればエラーメッセージを、無ければ null を返す。
 * キャッシュキーを作る前・タグを解決する前に呼ぶ。
 */
export function validateTagFilter(
  tag: string | null | undefined,
  tags: string | null | undefined
): string | null {
  // 実際に使う方（tag が優先）だけを検証する。tag があれば tags は使わない
  const result = tagFilterSchema.safeParse({
    tag,
    tags: tag ? undefined : tags,
  });
  if (result.success) return null;
  return result.error.issues.map((issue) => issue.message).join('; ');
}

/**
 * 検索語を語に分ける。前後の空白を除き、半角・全角の空白（タブ・改行を含む）で区切る。
 * 検証・検索条件・キャッシュキーで同じ区切り方を使うこと（ずれると語数の上限を
 * すり抜けられたり、別の条件が同じキャッシュキーになったりする）。
 */
export function splitSearchKeywords(
  search: string | null | undefined
): string[] {
  if (!search) return [];
  return search
    .trim()
    .split(/[\s\u3000]+/)
    .filter((k) => k.length > 0);
}

/**
 * 記事一覧の検索語を上限内に切り詰めて語に分ける（#684）。前後の空白を除いた先頭
 * MAX_SEARCH_QUERY_LENGTH 文字（コードポイント単位）の中の、先頭 MAX_SEARCH_KEYWORDS 語を返す。
 * 語ごとに ILIKE の条件が増えるので、レート制限のない一覧 API で重いクエリを組み立てさせない。
 * 画面の検索欄には上限がないので、400 にせず切り詰める（超えた分の語は使わない）。
 */
export function capSearchKeywords(search: string | null | undefined): string[] {
  if (!search) return [];
  const head = Array.from(search.trim())
    .slice(0, MAX_SEARCH_QUERY_LENGTH)
    .join('');
  // 条件はすべて AND なので、重複した語は結果を変えない。枠を使わないよう先に除く
  return [...new Set(splitSearchKeywords(head))].slice(0, MAX_SEARCH_KEYWORDS);
}

/**
 * 検索語のキャッシュキー（#684）。検索条件と同じ capSearchKeywords の語を並べ替え、
 * JSON の配列にする。区切り文字での連結だと "a,b c" と "a b,c" や、検索語 "none" と
 * 「検索なし」（'none'）が同じキーになる。v2: は #684 より前の形式（語を ',' で連結）の
 * キャッシュと一致させないための印
 */
export function searchCacheKey(search: string | null | undefined): string {
  const keywords = capSearchKeywords(search);
  return keywords.length > 0
    ? `v2:${JSON.stringify([...keywords].sort())}`
    : 'none';
}

/**
 * 検索語（詳細検索の `q`）の長さと語数を検証する（#684）。問題があればエラーメッセージを、
 * 無ければ null を返す。画面から呼ばれない API で使い、超えたら 400 にする。
 * 長さは前後の空白を除いたコードポイントの数、語は splitSearchKeywords で数える。
 */
const searchQuerySchema = z
  .string()
  .nullish()
  .superRefine((search, ctx) => {
    if (!search) return;
    if (Array.from(search.trim()).length > MAX_SEARCH_QUERY_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `search must be at most ${MAX_SEARCH_QUERY_LENGTH} characters`,
      });
    }
    if (splitSearchKeywords(search).length > MAX_SEARCH_KEYWORDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `search must contain at most ${MAX_SEARCH_KEYWORDS} keywords`,
      });
    }
  });

export function validateSearchQuery(
  search: string | null | undefined
): string | null {
  const result = searchQuerySchema.safeParse(search);
  if (result.success) return null;
  return result.error.issues.map((issue) => issue.message).join('; ');
}

/**
 * 絞り込むタグ名を、名前ごとのタグ ID の組にする（#681）。
 *
 * タグ名は lower(name) で照合する。Prisma の `mode: 'insensitive'` は ILIKE になり、
 * 名前の `_` と `%` がワイルドカードとして効くため（例: "Claude_Code" が
 * "Claude Code" にも当たる）使わない。どのタグにも当たらない名前は空の組になる。
 * タグの絞り込みが無ければ空の配列を返す。
 */
export async function resolveTagIdGroups(
  tag: string | null | undefined,
  tags: string | null | undefined
): Promise<string[][]> {
  const tagList = parseTagList(tag, tags);
  if (tagList.length === 0) return [];
  return findTagIdGroupsByNames(tagList);
}

/**
 * Push tag filter conditions into the AND conditions array or directly onto
 * the where object for OR-mode tag matching.
 *
 * - `tagMode` 'AND': articles must have ALL specified tags
 * - `tagMode` other (default): articles must have ANY specified tag (OR)
 *
 * 名前に当たるタグが無い組は `id: { in: [] }` になり、その条件は何にも当たらない
 * （OR ではすべての組が空のとき、AND では 1 つでも空のとき、結果が 0 件になる）。
 *
 * @param where - The top-level WHERE object (used for OR-mode tags assignment)
 * @param andConditions - AND conditions array (used for AND-mode tag conditions)
 * @param tagIdGroups - 名前ごとのタグ ID の組（resolveTagIdGroups の戻り値）。空なら絞り込まない
 * @param tagMode - 'AND' for all-tags matching, anything else for any-tag matching
 */
export function pushTagFilter(
  where: ArticleWhereInput,
  andConditions: ArticleWhereInput[],
  tagIdGroups: string[][],
  tagMode: string | null | undefined
): void {
  if (tagIdGroups.length === 0) return;

  if (tagMode === 'AND') {
    andConditions.push(
      ...tagIdGroups.map((ids) => ({ tags: { some: { id: { in: ids } } } }))
    );
  } else {
    where.tags = {
      some: { id: { in: [...new Set(tagIdGroups.flat())] } },
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
  // 上限内に切り詰める（キャッシュキーも capSearchKeywords で作るので条件と一致する）
  const keywords = capSearchKeywords(search);
  if (keywords.length === 0) return;

  // contains は ILIKE になるので、_ や % がワイルドカードにならないようにエスケープする
  const keywordConditions: ArticleWhereInput[] = keywords.map((keyword) => {
    const pattern = escapeLikePattern(keyword);
    return {
      OR: [
        { title: { contains: pattern, mode: 'insensitive' as const } },
        { summary: { contains: pattern, mode: 'insensitive' as const } },
      ],
    };
  });

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
    } else {
      logger.warn(
        `pushDateRangeFilter: Invalid custom date range ignored dateFrom=${dateFrom} dateTo=${dateTo}`
      );
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
