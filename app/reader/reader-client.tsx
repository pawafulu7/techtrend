'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import {
  useInfiniteQuery,
  useQuery,
  keepPreviousData,
} from '@tanstack/react-query';
import {
  PAPER_SOURCE_IDS_PARAM,
  isPaperSourceId,
  withoutPaperSourceIds,
} from '@/lib/utils/source/paper-source';
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

const READER_ARTICLES_PER_PAGE = 20;

interface ReaderClientProps {
  tags: Array<{ id: string; name: string; count: number }>;
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
  const params = new URLSearchParams({
    page: String(page),
    limit: String(READER_ARTICLES_PER_PAGE),
    sortBy: 'publishedAt',
    sortOrder: 'desc',
    ...filterParams,
  });
  // 論文のソースを除外（ホームと同じ。専用の/papersページで表示するため）
  params.set('excludeSources', PAPER_SOURCE_IDS_PARAM);
  params.set('excludeUnprocessed', 'true');
  const res = await fetch(`/api/articles/list?${params}`);
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

export function ReaderClient({ tags }: ReaderClientProps) {
  const searchParams = useSearchParams();

  // Extract filter params from URL
  const filterParams = useMemo(() => {
    const params: Record<string, string> = {};
    const sortBy = searchParams.get('sortBy');
    const sortOrder = searchParams.get('sortOrder');
    const sourcesParam = searchParams.get('sources');
    const sourceId = searchParams.get('sourceId');
    const tagsParam = searchParams.get('tags');
    const tagMode = searchParams.get('tagMode');
    const searchParam = searchParams.get('search');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const dateRange = searchParams.get('dateRange');
    const category = searchParams.get('category');
    const includeOffTopic = searchParams.get('includeOffTopic');

    if (sortBy) params.sortBy = sortBy;
    if (sortOrder) params.sortOrder = sortOrder;
    // 論文のソースは除く（残りが無ければ全選択。withoutPaperSourceIds）
    const sources = sourcesParam
      ? withoutPaperSourceIds(sourcesParam)
      : undefined;
    if (sources) params.sources = sources;
    if (sourceId && !isPaperSourceId(sourceId)) params.sourceId = sourceId;
    if (tagsParam) params.tags = tagsParam;
    if (tagMode) params.tagMode = tagMode;
    if (searchParam) params.search = searchParam;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    if (dateRange) params.dateRange = dateRange;
    // category を拾わないと、フィルタパネルでカテゴリを選んでも URL だけ変わって
    // 一覧が変化しない（API 側は category を受け付ける）
    if (category) params.category = category;
    // 技術者向けでない記事を含める指定（issue #722）。ホームから URL ごと引き継ぐ
    if (includeOffTopic === 'true') params.includeOffTopic = includeOffTopic;

    return params;
  }, [searchParams]);

  // key forces remount (and selectedId reset) when filters change.
  // `article` は含めない（記事選択のたびに Inner が再マウントされ、選択状態や
  // 読み込み済みページが失われてしまうため。filterParams から再構成する）。
  const filterKey = useMemo(
    () => new URLSearchParams(filterParams).toString(),
    [filterParams]
  );

  return (
    <ReaderClientInner
      key={filterKey}
      tags={tags}
      filterParams={filterParams}
    />
  );
}

function ReaderClientInner({
  tags,
  filterParams,
}: {
  tags: ReaderClientProps['tags'];
  filterParams: Record<string, string>;
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
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-[var(--tt-color-border)] px-4 py-2">
        {/* Issue #700: 作業型の画面なのでレイアウトは保ち、h1 はツールバーの左端に置く。
            記事タイトルを h1 にすると、狭い画面で一覧だけを出すときに h1 が消えるため */}
        <h1 className="font-heading text-foreground text-h1 mr-2 flex items-center gap-2">
          <BookOpen className="text-primary h-5 w-5" aria-hidden="true" />
          リーダー
        </h1>
        <FilterSidebarToggle />
        <MobileSearchToggle />
        <div className="hidden lg:block">
          <SearchBox />
        </div>
        <TagFilterDropdown tags={tags} />
        <SortButtons />
      </div>
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
            isLoading={isLoadingList}
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
    </div>
  );
}
