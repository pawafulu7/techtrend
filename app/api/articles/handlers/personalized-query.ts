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
import type { PersonalizedFilterOptions } from '@/lib/personalization/types';
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
  type ValidSortField,
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

/**
 * 推薦キャッシュのキー。ページ・件数は含めず、全候補の順位を 1 エントリで持つ。
 *
 * - 接頭辞は `ids:` で始める（重心の再計算スクリプトが `ids:*` を無効化するため）。
 *   `v2:` は旧形式（ページ単位の `ids:<カテゴリ ID>:...`）と衝突させないため
 * - 可変部分は JSON にして、区切り文字を含む値どうしが同じキーにならないようにする
 * - 除外ソース（excludeSources）は候補の抽出に使わないので、キーにも入れない
 */
export function buildPersonalizedCacheKey(
  options: Pick<
    PersonalizedFilterOptions,
    'categoryIds' | 'periodMonths' | 'sortBy' | 'sortOrder'
  >
): string {
  return `ids:v2:${JSON.stringify([
    uniqueSorted(options.categoryIds),
    options.periodMonths,
    options.sortBy,
    options.sortOrder,
  ])}`;
}

/**
 * 推薦候補に掛ける条件（表示条件＋ユーザーが選んだ絞り込み）を組み立てる。
 * 表示条件は今までの推薦経路と同じ（非表示を除く・要約の計算済み）で、
 * `withSourceFilter` が有効なソースだけに絞る。本文が空の記事の除外（`withContentFilter`）と
 * `excludeUnprocessed` は、推薦経路の表示条件を変えない方針（#684 のユーザーの決定）なので掛けない。
 * `emptyResult` が true なら、条件に合う記事はない（`sources=none` か、指定したソースが解決できない）
 *
 * タグは where に入れず、`tagIdGroups` を返して `filterIdsByTags` で絞る（理由はその説明を参照）
 */
async function buildPersonalizedWhere(
  filters: FilterParams,
  sortBy: ValidSortField,
  metrics: MetricsCollector
): Promise<{
  where: ArticleWhereInput;
  tagIdGroups: string[][];
  emptyResult: boolean;
}> {
  const builder = new ArticleWhereClauseBuilder(metrics);
  // 結果が必ず空になる条件は、タグの解決より前に判定して問い合わせを省く
  const { emptyResult } = await builder.withSourceFilter(
    filters.sources,
    filters.sourceId
  );
  if (emptyResult) {
    return { where: builder.build(), tagIdGroups: [], emptyResult };
  }

  const tagIdGroups = await resolveTagIdGroups(filters.tag, filters.tags);
  if (tagIdGroups.length > 0 && !canMatchTags(tagIdGroups, filters.tagMode)) {
    return { where: builder.build(), tagIdGroups, emptyResult: true };
  }

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
  await builder.withExcludeSources(filters.excludeSources);

  return { where: builder.build(), tagIdGroups, emptyResult: false };
}

/**
 * 名前を解決したタグの組で、合う記事がありうるか（`pushTagFilter` と同じ判定）。
 * OR はすべての組が空、AND は 1 つでも空の組があると、どの記事にも合わない
 */
function canMatchTags(
  tagIdGroups: string[][],
  tagMode: string | undefined
): boolean {
  return tagMode === 'AND'
    ? tagIdGroups.every((group) => group.length > 0)
    : tagIdGroups.some((group) => group.length > 0);
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
  if (
    cached &&
    Array.isArray(cached.ids) &&
    cached.ids.every((id) => typeof id === 'string')
  ) {
    return cached.ids;
  }

  const result = await categoryFilterService.filterArticles(options);
  if ((result.meta?.appliedCategories?.length ?? 0) === 0) {
    return null;
  }

  const ids = result.articles.map((article) => article.articleId);
  // 一部のカテゴリの検索が失敗した結果は、欠けた順位を有効期間中の全ページに残さないようキャッシュしない
  if (!result.meta.partialFailure) {
    try {
      await personalizationCache.set(cacheKey, { ids });
    } catch (cacheError) {
      logger.warn({ err: cacheError }, 'Personalization cache set failed');
    }
  }
  return ids;
}

/**
 * パーソナライズした記事一覧を返す。
 *
 * - null: 通常検索に切り替える（推薦のフォールバック・全候補が空・順位の取得の例外）
 * - 例外: 候補を得た後の絞り込み・記事の取得の失敗（呼び出し元で 500 にする）
 * - 空の結果: 候補はあるが絞り込みに合う記事がない、指定したソースが解決できない、最終ページを超えた
 */
export async function executePersonalizedQuery(
  params: ParsedQueryParams,
  metrics: MetricsCollector
): Promise<ArticleQueryResult | null> {
  const { pagination, display, personalization, filters } = params;
  const { page, limit, sortBy, sortOrder } = pagination;

  const {
    where: filterWhere,
    tagIdGroups,
    emptyResult,
  } = await buildPersonalizedWhere(filters, sortBy, metrics);
  if (emptyResult) {
    return createEmptyResponse(page, limit);
  }

  // 除外ソースは推薦候補の抽出には渡さず、後段の条件（withExcludeSources）だけで除く。
  // 抽出で除くと、候補がすべて除外ソースのときに「推薦できなかった」と判定されて
  // 通常検索に切り替わり、推薦候補にない記事が出てしまう（Stage 2 は Stage 1 の結果を
  // 絞るだけなので、後段で除いても残る候補は同じ）
  //
  // 通常検索に切り替えるのは推薦（順位の取得）が失敗したときだけ。候補を得た後の絞り込みや
  // 記事の取得の例外は呼び出し元に投げる（切り替えると推薦候補にない記事を返してしまうため）
  let personalizedIds: string[] | null;
  try {
    personalizedIds = await getPersonalizedIds({
      categoryIds: uniqueSorted(personalization.categoryIds),
      periodMonths: personalization.periodMonths,
      limit,
      sortBy,
      sortOrder,
      allCandidates: true,
    });
  } catch (error) {
    logger.error(
      { err: error },
      'Personalized filtering failed, falling back to standard query'
    );
    return null;
  }

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
  // （タグも EXISTS ではなく結合テーブルで判定し直す）
  const pageArticles = await withDbTiming(
    metrics,
    () =>
      measureAsync('article.fetch_by_ids', async (span) => {
        span.setAttribute('idCount', pageIds.length);
        const pageMatchedIds =
          tagIdGroups.length > 0
            ? await filterIdsByTags(pageIds, tagIdGroups, filters.tagMode)
            : pageIds;
        if (pageMatchedIds.length === 0) return [];
        return prisma.article.findMany({
          where: { ...filterWhere, id: { in: pageMatchedIds } },
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
}
