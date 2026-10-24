/**
 * ホームの記事一覧の取得条件・queryKey・API の要求を組み立てる。
 *
 * クライアント（app/components/home/home-client-infinite.tsx と
 * app/hooks/use-infinite-articles.ts）と、サーバーでの1ページ目の先読み
 * （app/components/home/prefetch-home-articles.ts）が同じ関数を使う。リーダー（app/reader/reader-client.tsx）も
 * 一覧の条件を buildHomeArticleFilters で組み立てる。どちらかで条件や
 * キーの作り方がずれると、サーバーで取ったページをクライアントが使えず、
 * hydration の後に1ページ目を取り直すため（issue #714）。
 * ブラウザの API（navigator など）はここで参照しない。
 */

import type { HomePersonalization } from '@/lib/personalization/preferences-state';
import {
  isPaperSourceId,
  withoutPaperSourceIds,
} from '@/lib/utils/source/paper-source';

export type ArticleFilterValue = string | boolean | undefined;
export type ArticleFilters = Record<string, ArticleFilterValue>;

/** モバイル端末の User-Agent か（軽量モードの判定。サーバーとクライアントで同じ式を使う） */
export function isMobileUserAgent(userAgent: string): boolean {
  return /Mobi|Android/i.test(userAgent);
}

/** 1回の取得で読む件数 */
export const ARTICLES_PAGE_LIMIT = 20;

/**
 * URL の検索条件のうち、一覧の取得条件にしないもの（sources/sourceId は別に扱う）。
 * article はリーダーで選んでいる記事。条件に入れると、記事を選ぶたびに一覧を取り直す
 */
const NON_FILTER_PARAMS = new Set([
  'page',
  'limit',
  'returning',
  'sources',
  'sourceId',
  'article',
]);

/** URLSearchParams と next/navigation の ReadonlyURLSearchParams の共通部分 */
export interface SearchParamsLike {
  forEach(callback: (value: string, key: string) => void): void;
  has(name: string): boolean;
  get(name: string): string | null;
}

export interface BuildHomeArticleFiltersInput {
  searchParams: SearchParamsLike;
  /** URL に sortBy が無いときの並び順（Cookie から復元した値） */
  initialSortBy?: string;
  /** URL に sources/sourceId が無いときのソース（Cookie から復元した値） */
  initialSourceIds?: string[];
  personalization: HomePersonalization;
  /** 除外するソース ID（カンマ区切り） */
  excludeSources?: string;
}

/**
 * ホームの一覧の取得条件を作る。includeUserData は呼び出し側で足す
 */
export function buildHomeArticleFilters({
  searchParams,
  initialSortBy,
  initialSourceIds,
  personalization,
  excludeSources,
}: BuildHomeArticleFiltersInput): Record<string, string> {
  const params: Record<string, string> = {};

  // まず、sources以外のパラメータをコピー
  searchParams.forEach((value, key) => {
    if (!NON_FILTER_PARAMS.has(key)) {
      params[key] = value;
    }
  });

  // URLパラメータにsortByがない場合、initialSortByを使用
  if (!params.sortBy && initialSortBy) {
    params.sortBy = initialSortBy;
  }

  // 重要: URLに明示的にsources=noneがある場合と、パラメータがない場合を区別する
  if (searchParams.has('sources')) {
    // URLの値をAPIに送る（all/none含む）。論文のソースは除き、残りが無ければ送らない
    // （画面と同じく全選択。withoutPaperSourceIds）
    const sources = withoutPaperSourceIds(searchParams.get('sources')!);
    if (sources) params.sources = sources;
  } else if (searchParams.has('sourceId')) {
    // 論文のソースは送らない（sources と同じく全選択。isPaperSourceId）
    const sourceId = searchParams.get('sourceId')!;
    if (!isPaperSourceId(sourceId)) params.sourceId = sourceId;
  } else if (initialSourceIds !== undefined) {
    // Cookie由来のinitialSourceIdsを使用
    params.sources =
      initialSourceIds.length === 0 ? 'none' : initialSourceIds.join(',');
  }
  // URLパラメータなし＆Cookie値なしの場合はsourcesを設定しない（全選択）

  // 注: returningはスクロール位置復元のトリガーとしてのみ使い、
  // フィルターには含めない（queryKeyが変わり1ページ目から取り直しになるため）

  // 要約の無い記事は常に除外する（スライドは画像で中身が分かるので残す。pushProcessedFilter）
  params.excludeUnprocessed = 'true';

  // パーソナライズフィルターが有効な場合、カテゴリIDと期間を追加
  const { filterEnabled, selectedCategories, periodMonths } = personalization;
  if (filterEnabled && selectedCategories.length > 0) {
    params.personalized = 'true';
    // 設定 API はカテゴリの順序を決めていない。順序だけが違う同じ設定で、サーバーと
    // クライアントの queryKey が分かれないように並べる
    params.categoryIds = [...selectedCategories].sort().join(',');
    if (periodMonths > 0) {
      params.periodMonths = String(periodMonths);
    }
  }

  // 特定のソースを除外（例: 論文のソースをホームページから除外）
  if (excludeSources) {
    params.excludeSources = excludeSources;
  }

  return params;
}

/**
 * 取得条件を正規化する（undefined・空文字と returning を除き、キーをソート）。
 * returning は「記事詳細から戻ってきた」ことを示すUI用フラグで取得結果には影響しない。
 * queryKey / APIクエリに混ざると戻る度に別クエリ扱いとなり1ページ目から取り直しになるため、
 * 呼び出し側の漏れを防ぐ意味でもここを単一の除外点とする
 */
export function normalizeArticleFilters(
  filters: ArticleFilters
): ArticleFilters {
  return Object.keys(filters)
    .sort()
    .reduce((acc, key) => {
      if (key === 'returning') {
        return acc;
      }
      if (filters[key] !== undefined && filters[key] !== '') {
        acc[key] = filters[key];
      }
      return acc;
    }, {} as ArticleFilters);
}

/** 正規化した取得条件から作る、無限スクロールの一覧の queryKey */
export function infiniteArticlesQueryKey(normalizedFilters: ArticleFilters) {
  return ['infinite-articles', JSON.stringify(normalizedFilters)] as const;
}

export interface ArticlesRequestOptions {
  page: number;
  /** 前のページで得た総件数（page > 1 で COUNT を省くため） */
  total?: number;
  /** モバイル・低速回線向けの軽量モード */
  lightweight?: boolean;
}

/**
 * 一覧 API の要求先と検索条件を作る。
 * 既読フィルタ・パーソナライズが無いときは軽量版の /api/articles/list を使う
 */
export function buildArticlesRequest(
  normalizedFilters: ArticleFilters,
  { page, total, lightweight }: ArticlesRequestOptions
): {
  endpoint: '/api/articles' | '/api/articles/list';
  searchParams: URLSearchParams;
} {
  const searchParams = new URLSearchParams();

  Object.entries(normalizedFilters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      searchParams.append(key, String(value));
    }
  });

  searchParams.set('page', String(page));
  searchParams.set('limit', String(ARTICLES_PAGE_LIMIT));

  // page > 1の場合、前回のレスポンスから総件数を送信（COUNTクエリスキップ用）
  if (page > 1 && total) {
    searchParams.set('total', String(total));
  }

  if (lightweight) {
    searchParams.set('lightweight', 'true');
  }

  // パーソナライズフィルタがある場合は /api/articles を使用（categoryFilterServiceが必要）
  const hasCategoryIds =
    normalizedFilters.categoryIds &&
    String(normalizedFilters.categoryIds).length > 0;
  const hasPeriodMonths =
    normalizedFilters.periodMonths &&
    Number(normalizedFilters.periodMonths) > 0;
  const useFullApi = Boolean(
    normalizedFilters.readFilter || hasCategoryIds || hasPeriodMonths
  );
  const endpoint = useFullApi ? '/api/articles' : '/api/articles/list';

  // includeRelations はデフォルトで false（APIサイドで設定済み）
  // パーソナライズ時またはフルAPI使用時は source 情報が必要なため true を設定
  if (normalizedFilters.includeRelations || useFullApi) {
    searchParams.set('includeRelations', 'true');
  }

  // includeUserData を条件付きで設定（キャッシュバイパスを避けるため）
  // 既読フィルタがある場合またはユーザーデータが明示的に要求された場合のみ
  if (normalizedFilters.readFilter || normalizedFilters.includeUserData) {
    searchParams.set('includeUserData', 'true');
  }

  return { endpoint, searchParams };
}
