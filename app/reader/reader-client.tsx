'use client';

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import {
  useInfiniteQuery,
  useQuery,
  keepPreviousData,
} from '@tanstack/react-query';
import { PAPER_SOURCE_IDS_PARAM } from '@/lib/utils/source/paper-source';
import {
  buildArticlesRequest,
  buildHomeArticleFilters,
  normalizeArticleFilters,
} from '@/lib/articles/home-articles-query';
import { usePersonalizationPreferences } from '@/lib/hooks/use-personalization-preferences';
import { ReadTracker } from '@/components/article/read-tracker';
import { FilterSidebarToggle } from '@/app/components/home/filter-sidebar';
import { MobileSearchToggle } from '@/app/components/common/mobile-search-toggle';
import { SearchBox } from '@/app/components/common/search-box';
import { TagFilterDropdown } from '@/app/components/common/tag-filter-dropdown';
import { SortButtons } from '@/app/components/common/sort-buttons';
import { useMediaQuery } from '@/app/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { ReaderArticleList } from './article-list';
import { useReaderListNavigation } from './use-reader-list-navigation';
import { useReaderSelection } from './use-reader-selection';
import { ReaderArticleDetail } from './article-detail';
import { nextArticleIdAfter, uniqueById } from './utils';
import type {
  ReaderListArticle,
  ArticleListResponse,
  ArticleDetailResponse,
} from './types';

/** md: Tailwindブレークポイント (768px) と揃える */
const DESKTOP_MEDIA_QUERY = '(min-width: 768px)';

// リーダーには既読・未読の絞り込みの操作が無い。ホームの URL から引き継いでも条件にしない
// （付けると一覧がユーザーごとの結果になり、ユーザーを区別しないキャッシュに載る）
const READER_IGNORED_FILTERS = ['readFilter', 'includeUserData'];

interface ReaderClientProps {
  tags: Array<{ id: string; name: string; count: number }>;
  /** URL に sortBy が無いときの並び順（ホームと同じ Cookie から） */
  initialSortBy?: string;
  /** URL に sources/sourceId が無いときのソース（ホームと同じ Cookie から） */
  initialSourceIds?: string[];
  /** lg 未満のフィルターの入口（サーバーのデータを使うので、ページから渡す） */
  mobileFilters?: ReactNode;
}

async function parseApiJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json();
  } catch {
    throw new Error(`HTTP ${res.status}: レスポンスの解析に失敗しました`);
  }
}

function getApiErrorMessage(
  json: Record<string, unknown>,
  fallback: string
): string {
  return (
    (typeof json.error === 'string'
      ? json.error
      : (json.error as { message?: string })?.message) || fallback
  );
}

async function fetchArticleList(
  page: number,
  filterParams: Record<string, string>
): Promise<Extract<ArticleListResponse, { success: true }>> {
  // 要求先と検索条件もホームと同じ関数で作る。パーソナライズしているときは /api/articles（関連つき）、
  // それ以外は軽量版の /api/articles/list。どちらも { success, data: { items, page, totalPages } } を返す
  const { endpoint, searchParams } = buildArticlesRequest(
    normalizeArticleFilters({
      sortBy: 'publishedAt',
      sortOrder: 'desc',
      ...filterParams,
    }),
    { page }
  );
  const res = await fetch(`${endpoint}?${searchParams}`);
  const json = await parseApiJson(res);
  if (!res.ok || !json.success)
    throw new Error(getApiErrorMessage(json, '記事の読み込みに失敗しました'));
  return json as unknown as Extract<ArticleListResponse, { success: true }>;
}

async function fetchArticleDetail(
  id: string
): Promise<Extract<ArticleDetailResponse, { success: true }>> {
  const res = await fetch(`/api/articles/${id}`);
  const json = await parseApiJson(res);
  if (!res.ok || !json.success)
    throw new Error(getApiErrorMessage(json, '記事の取得に失敗しました'));
  return json as unknown as Extract<ArticleDetailResponse, { success: true }>;
}

export function ReaderClient({
  tags,
  initialSortBy,
  initialSourceIds,
  mobileFilters,
}: ReaderClientProps) {
  const searchParams = useSearchParams();
  // パーソナライズはホームと同じ設定（分野・期間・ホームの絞り込みのオン/オフ）を使う。
  // 設定が分かるまでは一覧を取らない（取ってから条件が変わると、一覧を取り直すことになる）
  const {
    selectedCategories,
    filterEnabled,
    periodMonths,
    isLoadingPreferences,
  } = usePersonalizationPreferences();

  // 一覧の条件はホームと同じ関数で組み立てる（Issue #709）。URL に無いソース・並び順は Cookie の値、
  // 論文のソースと要約の無い記事は除く。選んでいる記事（article）は条件に入れない
  const filterParams = useMemo(() => {
    const params = buildHomeArticleFilters({
      searchParams,
      initialSortBy,
      initialSourceIds,
      personalization: { filterEnabled, selectedCategories, periodMonths },
      // 論文のソースを除外（ホームと同じ。専用の/papersページで表示するため）
      excludeSources: PAPER_SOURCE_IDS_PARAM,
    });
    READER_IGNORED_FILTERS.forEach((key) => delete params[key]);
    return params;
  }, [
    searchParams,
    initialSortBy,
    initialSourceIds,
    filterEnabled,
    selectedCategories,
    periodMonths,
  ]);

  // key forces remount (and selectedId reset) when filters change.
  // `article` は含めない（記事選択のたびに Inner が再マウントされ、選択状態や
  // 読み込み済みページが失われてしまうため。filterParams から再構成する）。
  const filterKey = useMemo(
    () => new URLSearchParams(filterParams).toString(),
    [filterParams]
  );

  // ツールバーは key の付いた Inner の外に置く。中に置くと、フィルターを1つ変えるたびに作り直され、
  // 開いているフィルターの Sheet やタグの選択が閉じる
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-[var(--tt-color-border)] px-4 py-2">
        {/* Issue #700: 作業型の画面なのでレイアウトは保ち、h1 はツールバーの左端に置く。
            記事タイトルを h1 にすると、狭い画面で一覧だけを出すときに h1 が消えるため */}
        <h1 className="font-heading text-foreground text-h1 mr-2 flex items-center gap-2">
          <BookOpen className="text-primary h-5 w-5" aria-hidden="true" />
          リーダー
        </h1>
        <FilterSidebarToggle />
        {mobileFilters}
        <MobileSearchToggle />
        <div className="hidden lg:block">
          <SearchBox />
        </div>
        <TagFilterDropdown tags={tags} />
        <SortButtons initialSortBy={initialSortBy} />
      </div>
      <ReaderClientInner
        key={filterKey}
        filterParams={filterParams}
        listEnabled={!isLoadingPreferences}
      />
    </div>
  );
}

function ReaderClientInner({
  filterParams,
  listEnabled,
}: {
  filterParams: Record<string, string>;
  /** パーソナライズの設定が分かったか（分かるまで一覧を取らない） */
  listEnabled: boolean;
}) {
  const searchParams = useSearchParams();
  const articleParam = searchParams.get('article');

  // md未満はモバイル。SSR時はfalse（初期レンダーはリスト表示側に倒れる）。
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const isDesktopRef = useRef(isDesktop);
  useEffect(() => {
    isDesktopRef.current = isDesktop;
  }, [isDesktop]);

  // 一覧で選んでいる行と、記事を選ぶ（URL の `article` を書く）・モバイルの「← 記事リスト」で一覧に戻る処理
  // （use-reader-selection.ts）
  const {
    activeId,
    selectArticle,
    moveActive,
    backToList,
    beginPendingSelection,
  } = useReaderSelection({ articleParam, isDesktop, isDesktopRef });

  // Infinite query for article list
  const {
    data: listData,
    isLoading: isLoadingList,
    error: listError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchList,
  } = useInfiniteQuery({
    queryKey: ['reader-articles', filterParams],
    queryFn: ({ pageParam }) => fetchArticleList(pageParam, filterParams),
    enabled: listEnabled,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.data;
      return page < totalPages ? page + 1 : undefined;
    },
    staleTime: 2 * 60 * 1000,
  });

  // Flatten all pages into a single article array（ページの境目で重なった記事は除く。uniqueById）
  const articles = useMemo(
    () => uniqueById(listData?.pages.flatMap((p) => p.data.items) ?? []),
    [listData]
  );

  // Auto-select first article (articleParam未指定時のデフォルト表示用。
  // URLは更新しない＝モバイルのペイン切り替えはarticleParamの有無のみで判定する)
  const effectiveSelectedId = articleParam ?? articles[0]?.id ?? null;

  // Detail query (keep previous article visible while loading next)
  const {
    data: detailData,
    isFetching: isFetchingDetail,
    error: detailError,
  } = useQuery({
    queryKey: ['reader-article-detail', effectiveSelectedId],
    queryFn: () => fetchArticleDetail(effectiveSelectedId!),
    enabled: !!effectiveSelectedId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const selectedArticle = detailData?.data ?? null;

  // Prev/Next navigation。基準は一覧で選んでいる行（URL の更新は遅れて届くので、↓↑ の直後に押しても
  // 一覧の選択から前後へ進む）。選んでいる行は本文の記事を開くたびに合わせる（use-reader-selection.ts）
  const selectedId = activeId ?? effectiveSelectedId;
  const currentIndex = selectedId
    ? articles.findIndex((a: ReaderListArticle) => a.id === selectedId)
    : -1;
  const isSelectedLoaded = currentIndex >= 0;
  const hasPrev = currentIndex > 0;
  // hasNext: 読み込み済みリスト内に次の記事があるか（handleNext/keyboardの分岐に使用）
  const hasNext = currentIndex >= 0 && currentIndex < articles.length - 1;
  // canGoNextUi: Nextボタンの有効/無効（UI表示用）。
  // 未ロード記事へのdeep link時（currentIndex === -1）はhasNextPageに関わらず無効化する
  const canGoNextUi = isSelectedLoaded && (hasNext || !!hasNextPage);

  // 次ページ取得後の続き選択。Prev/Nextやキーボード連続操作の延長のため常にreplace。
  // - 次ページを読み込み中に押されたら、その取得を待って選ぶ（cancelRefetch: false）。ほかの取得（再接続などでの
  //   読み直し）の最中なら、以前どおりそれを止めて次ページを読む（待つと次ページを読まずに終わるため）
  // - 読む間に選択や URL が変わったら（別の記事を選んだ・一覧に戻った・戻る・画面を離れた）、上書きしない
  // - 次の記事は、番号ではなく今の記事の id から、重なりを除いた並びで探す（nextArticleIdAfter）
  const fetchNextAndSelect = useCallback(
    (idx: number) => {
      if (!hasNextPage) return;
      const fromId = articles[idx]?.id;
      const isStillCurrent = beginPendingSelection();
      fetchNextPage({ cancelRefetch: !isFetchingNextPage })
        .then((result) => {
          if (!isStillCurrent() || !result.data) return;
          const nextId = nextArticleIdAfter(
            result.data.pages.flatMap((p) => p.data.items),
            fromId
          );
          if (nextId) selectArticle(nextId, { replace: true });
        })
        .catch(() => {
          // Error handled by useInfiniteQuery's error state
        });
    },
    [
      hasNextPage,
      isFetchingNextPage,
      articles,
      beginPendingSelection,
      fetchNextPage,
      selectArticle,
    ]
  );

  const handlePrev = useCallback(() => {
    if (hasPrev)
      selectArticle(articles[currentIndex - 1].id, { replace: true });
  }, [hasPrev, articles, currentIndex, selectArticle]);

  const handleNext = useCallback(() => {
    if (hasNext) {
      selectArticle(articles[currentIndex + 1].id, { replace: true });
    } else {
      fetchNextAndSelect(currentIndex);
    }
  }, [hasNext, articles, currentIndex, fetchNextAndSelect, selectArticle]);

  const handleLoadMore = useCallback(() => {
    // 取得中に呼ぶと、TanStack Query は進行中の取得を捨てて取り直す（cancelRefetch の既定）。
    // md 未満の末尾で↓を押し続けたときに同じページを何度も取りに行かないよう、取得中は呼ばない
    if (!hasNextPage || isFetchingNextPage) return;
    fetchNextPage().catch(() => {
      // Error handled by useInfiniteQuery's error state
    });
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // 一覧の選択・キーボード操作・md 未満のフォーカスの移動（use-reader-list-navigation.ts）
  const {
    listActiveId,
    handleSelectArticle,
    handleKeyDown,
    listboxRef,
    listRegionRef,
    detailRegionRef,
  } = useReaderListNavigation({
    articles,
    articleParam,
    activeId,
    effectiveSelectedId,
    isDesktopRef,
    selectArticle,
    moveActive,
    fetchNextAndSelect,
    loadMore: handleLoadMore,
  });

  return (
    <>
      {/* Two-panel layout: md未満は article パラメータの有無で1ペイン切替、md以上は常に2ペイン */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left panel: Article list */}
        <div
          ref={listRegionRef}
          tabIndex={-1}
          className={cn(
            'shrink-0 overflow-y-auto border-r border-[var(--tt-color-border)] outline-none md:w-[320px] lg:w-[380px]',
            articleParam ? 'hidden md:block' : 'block w-full'
          )}
          role="region"
          aria-label="記事リスト"
        >
          <ReaderArticleList
            articles={articles}
            selectedId={listActiveId}
            isLoading={isLoadingList || !listEnabled}
            error={listError instanceof Error ? listError.message : null}
            onSelectArticle={handleSelectArticle}
            onKeyDown={handleKeyDown}
            onRetry={refetchList}
            hasNextPage={!!hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={handleLoadMore}
            listboxRef={listboxRef}
          />
        </div>
        {/* Right panel: Article detail */}
        <div
          ref={detailRegionRef}
          tabIndex={-1}
          // 本文の領域そのものをスクロールさせる。開いたときにフォーカスをここへ移すので、
          // そのまま矢印キー・PageDown・Space で読み進められる（スクロールする要素が子だと動かない）
          className={cn(
            'flex-1 overflow-y-auto outline-none',
            articleParam ? 'block' : 'hidden md:block'
          )}
          role="region"
          aria-label="記事詳細"
        >
          {/* 本文が見えている記事を、3 秒開いていたら既読にする。md 未満で一覧だけを出しているときは、
              先頭の記事を選んでいても本文は見えていないので既読にしない。次の記事を読み込む間は前の記事を
              出したままにするので（keepPreviousData）、選んでいる記事の本文が届いてから数える */}
          {selectedArticle &&
            selectedArticle.id === effectiveSelectedId &&
            (isDesktop || articleParam) && (
              <ReadTracker
                key={selectedArticle.id}
                articleId={selectedArticle.id}
                markOnLeave={false}
              />
            )}
          <ReaderArticleDetail
            article={selectedArticle}
            isLoading={!detailData && isFetchingDetail}
            error={detailError instanceof Error ? detailError.message : null}
            hasPrev={hasPrev}
            hasNext={canGoNextUi}
            onPrev={handlePrev}
            onNext={handleNext}
            onBack={backToList}
          />
        </div>
      </div>
    </>
  );
}
