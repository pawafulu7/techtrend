/**
 * Personalized query for the Articles API
 *
 * 推薦の候補（関心カテゴリの重心との類似度で並べた記事）に、ユーザーが選んだ絞り込みと
 * 表示条件を掛けて、推薦順のままページを切って返す。
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@/lib/prisma-exports';
import type { ArticleWithRelations } from '@/types/models';
import { RedisCache } from '@/lib/cache/redis-cache';
import { MetricsCollector, withDbTiming } from '@/lib/metrics/performance';
import { categoryFilterService } from '@/lib/personalization/category-filter-service';
import type {
  PersonalizedFilterOptions,
  PersonalizedSortBy,
} from '@/lib/personalization/types';
import logger from '@/lib/logger';
import { measureAsync } from '@/lib/personalization/tracing';

import {
  ArticleWhereClauseBuilder,
  buildSelectFields,
  createEmptyResponse,
  type ArticleQueryResult,
  type ArticleWhereInput,
  type FilterParams,
  type ParsedQueryParams,
} from '../lib';
import { resolveTagIdGroups } from '../lib/where-clause-predicates';

/** 推薦の順位のキャッシュ（テストで差し替えられるように export する） */
export const personalizationCache = new RedisCache({
  ttl: 300,
  namespace: 'personalization',
});

/** 推薦キャッシュに置く値（全候補の ID を推薦順に並べたもの） */
type CachedPersonalizedIds = { ids: string[] };

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function splitList(value: string | undefined): string[] {
  return value
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

/**
 * 推薦キャッシュのキー。ページ・件数は含めず、全候補の順位を 1 エントリで持つ。
 *
 * - 接頭辞は `ids:` で始める（重心の再計算スクリプトが `ids:*` を無効化するため）。
 *   `v2:` は旧形式（ページ単位の `ids:<カテゴリ ID>:...`）と衝突させないため
 * - 可変部分は JSON にして、区切り文字を含む値どうしが同じキーにならないようにする
 */
export function buildPersonalizedCacheKey(
  options: Pick<
    PersonalizedFilterOptions,
    'categoryIds' | 'periodMonths' | 'sortBy' | 'sortOrder' | 'excludeSourceIds'
  >
): string {
  return `ids:v2:${JSON.stringify([
    uniqueSorted(options.categoryIds),
    options.periodMonths,
    options.sortBy,
    options.sortOrder,
    uniqueSorted(options.excludeSourceIds ?? []),
  ])}`;
}

/**
 * 推薦候補に掛ける条件（表示条件＋ユーザーが選んだ絞り込み）を組み立てる。
 * 表示条件は今までの推薦経路と同じ（非表示を除く・要約の計算済み）で、
 * `withSourceFilter` が有効なソースだけに絞る。
 * `emptyResult` が true なら、条件に合う記事はない（`sources=none` か、指定したソースが解決できない）
 *
 * タグは where に入れず、`tagIdGroups` を返して `filterIdsByTags` で絞る（理由はその説明を参照）
 */
async function buildPersonalizedWhere(
  filters: FilterParams,
  sortBy: string,
  metrics: MetricsCollector
): Promise<{
  where: ArticleWhereInput;
  tagIdGroups: string[][];
  emptyResult: boolean;
}> {
  const builder = new ArticleWhereClauseBuilder(metrics);
  const tagIdGroups = await resolveTagIdGroups(filters.tag, filters.tags);

  builder
    .withProcessedFilter(true)
    .withLowQualityFilter(filters.excludeLowQuality === true)
    .withCategoryFilter(filters.category)
    .withSearchFilter(filters.search)
    .withDateRangeFilter({
      dateRange: filters.dateRange,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      sortBy,
    });

  const { emptyResult } = await builder.withSourceFilter(
    filters.sources,
    filters.sourceId
  );
  if (emptyResult) {
    return { where: builder.build(), tagIdGroups, emptyResult };
  }
  await builder.withExcludeSources(filters.excludeSources);

  return { where: builder.build(), tagIdGroups, emptyResult: false };
}

/**
 * 推薦候補のうち、選んだタグを持つ記事の ID を推薦順のまま返す。
 * 判定は `pushTagFilter` と同じ（OR はどれかの組のタグを 1 つ持つ、AND はすべての組から 1 つずつ持つ。
 * 名前が解決できず空になった組は、OR では何にも合わず、AND では全体が 0 件になる）。
 *
 * タグの条件を記事の EXISTS（`tags: { some }`）で掛けると、人気のタグ（AI・LLM など）を OR で
 * 複数選んだときに、プランナーがタグのリンクを全件（約 8 万行）読んでから候補の ID と突き合わせる
 * 計画を選び、開発 DB で約 8 秒かかった。候補の ID から結合テーブルを主キー（A, B）で直接引けば、
 * 候補数（最大で数百件）の範囲を読むだけで済む（約 1.5ms）
 */
async function filterIdsByTags(
  ids: string[],
  tagIdGroups: string[][],
  tagMode: string | undefined
): Promise<string[]> {
  const tagIds = [...new Set(tagIdGroups.flat())];
  if (tagIds.length === 0) return [];

  const links = await prisma.$queryRaw<Array<{ A: string; B: string }>>(
    Prisma.sql`
      SELECT "A", "B" FROM "_ArticleToTag"
      WHERE "A" = ANY(${ids}::text[]) AND "B" = ANY(${tagIds}::text[])
    `
  );
  const tagsByArticle = new Map<string, Set<string>>();
  for (const { A, B } of links) {
    const tags = tagsByArticle.get(A) ?? new Set<string>();
    tags.add(B);
    tagsByArticle.set(A, tags);
  }

  return ids.filter((id) => {
    const tags = tagsByArticle.get(id);
    if (!tags) return false;
    return tagMode === 'AND'
      ? tagIdGroups.every((group) => group.some((tagId) => tags.has(tagId)))
      : true;
  });
}

/**
 * 全候補の ID を推薦順に返す（キャッシュがあればそれを使う）。
 * 推薦がフォールバックした（`appliedCategories` が空）ときは null を返し、キャッシュしない
 */
async function getPersonalizedIds(
  options: PersonalizedFilterOptions
): Promise<string[] | null> {
  const cacheKey = buildPersonalizedCacheKey(options);

  let cached: CachedPersonalizedIds | null = null;
  try {
    cached = await measureAsync('personalization.cache_get', async (span) => {
      try {
        const result =
          await personalizationCache.get<CachedPersonalizedIds>(cacheKey);
        span.setAttribute('cacheHit', result !== null);
        return result;
      } catch (err) {
        // Defensive: RedisCache.get() currently swallows Redis errors and returns null,
        // so this branch is rarely hit. Kept to distinguish future error paths from
        // genuine cache misses. Message is omitted to avoid leaking secrets/keys
        // into the trace backend; recordException captures the full error event.
        span.setAttribute('cacheError', true);
        throw err;
      }
    });
  } catch (cacheError) {
    logger.warn(
      { err: cacheError },
      'Personalization cache get failed, proceeding without cache'
    );
  }
  if (cached && Array.isArray(cached.ids)) {
    return cached.ids;
  }

  const result = await categoryFilterService.filterArticles(options);
  if ((result.meta?.appliedCategories?.length ?? 0) === 0) {
    return null;
  }

  const ids = result.articles.map((article) => article.articleId);
  try {
    await personalizationCache.set(cacheKey, { ids });
  } catch (cacheError) {
    logger.warn({ err: cacheError }, 'Personalization cache set failed');
  }
  return ids;
}

/**
 * パーソナライズした記事一覧を返す。
 *
 * - null: 通常検索に切り替える（推薦のフォールバック・全候補が空・例外）
 * - 空の結果: 候補はあるが絞り込みに合う記事がない、指定したソースが解決できない、最終ページを超えた
 */
export async function executePersonalizedQuery(
  params: ParsedQueryParams,
  metrics: MetricsCollector
): Promise<ArticleQueryResult | null> {
  const { pagination, display, personalization, filters } = params;
  const { page, limit, sortBy, sortOrder } = pagination;

  try {
    const {
      where: filterWhere,
      tagIdGroups,
      emptyResult,
    } = await buildPersonalizedWhere(filters, sortBy, metrics);
    if (emptyResult) {
      return createEmptyResponse(page, limit);
    }

    const excludeSourceIds = splitList(filters.excludeSources);
    const personalizedIds = await getPersonalizedIds({
      categoryIds: uniqueSorted(personalization.categoryIds),
      periodMonths: personalization.periodMonths,
      limit,
      sortBy: sortBy as PersonalizedSortBy,
      sortOrder,
      excludeSourceIds:
        excludeSourceIds.length > 0
          ? uniqueSorted(excludeSourceIds)
          : undefined,
      allCandidates: true,
    });

    if (!personalizedIds || personalizedIds.length === 0) {
      return null; // Fall back to standard query
    }

    // 全候補のうち条件に合う ID を引き、推薦順に並べてから total を数えてページを切る
    const orderedIds = await withDbTiming(
      metrics,
      () =>
        measureAsync('article.filter_personalized_ids', async (span) => {
          span.setAttribute('idCount', personalizedIds.length);
          const tagMatchedIds =
            tagIdGroups.length > 0
              ? await filterIdsByTags(
                  personalizedIds,
                  tagIdGroups,
                  filters.tagMode
                )
              : personalizedIds;
          if (tagMatchedIds.length === 0) return [];

          const matched = await prisma.article.findMany({
            where: { ...filterWhere, id: { in: tagMatchedIds } },
            select: { id: true },
          });
          const matchedIds = new Set(matched.map((article) => article.id));
          return tagMatchedIds.filter((id) => matchedIds.has(id));
        }),
      'db_query'
    );
    const total = orderedIds.length;
    const totalPages = Math.ceil(total / limit);

    const offset = (page - 1) * limit;
    const pageIds = orderedIds.slice(offset, offset + limit);
    if (pageIds.length === 0) {
      return { items: [], total, page, limit, totalPages };
    }

    // 2 回の読み取りの間に条件外になった記事を返さないよう、ページの取得にも同じ条件を掛ける
    // （タグは除く。EXISTS で掛けると上の遅い計画になりうるうえ、タグの付け替えはまれなため）
    const pageArticles = await withDbTiming(
      metrics,
      () =>
        measureAsync('article.fetch_by_ids', async (span) => {
          span.setAttribute('idCount', pageIds.length);
          return prisma.article.findMany({
            where: { ...filterWhere, id: { in: pageIds } },
            select: buildSelectFields(display),
          });
        }),
      'db_query'
    );

    const articlesById = new Map(
      pageArticles.map((article) => [article.id, article])
    );
    const items = pageIds
      .map((id) => articlesById.get(id))
      .filter((article): article is (typeof pageArticles)[number] =>
        Boolean(article)
      );

    return {
      items: items as ArticleWithRelations[],
      total,
      page,
      limit,
      totalPages,
    };
  } catch (error) {
    logger.error(
      { err: error },
      'Personalized filtering failed, falling back to standard query'
    );
    return null;
  }
}
