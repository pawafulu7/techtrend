'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  useInfiniteQuery,
  useQuery,
  keepPreviousData,
} from '@tanstack/react-query';
import { ARXIV_SOURCE_ID } from '@/lib/constants/source-categories';
import { FilterSidebarToggle } from '@/app/components/home/filter-sidebar';
import { MobileSearchToggle } from '@/app/components/common/mobile-search-toggle';
import { SearchBox } from '@/app/components/common/search-box';
import { TagFilterDropdown } from '@/app/components/common/tag-filter-dropdown';
import { SortButtons } from '@/app/components/common/sort-buttons';
import { useMediaQuery } from '@/app/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { ReaderArticleList } from './article-list';
import { ReaderArticleDetail } from './article-detail';
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
  // Exclude arXiv articles (matches home page behavior)
  params.set('excludeSources', ARXIV_SOURCE_ID);
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

    if (sortBy) params.sortBy = sortBy;
    if (sortOrder) params.sortOrder = sortOrder;
    if (sourcesParam) params.sources = sourcesParam;
    if (sourceId) params.sourceId = sourceId;
    if (tagsParam) params.tags = tagsParam;
    if (tagMode) params.tagMode = tagMode;
    if (searchParam) params.search = searchParam;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    if (dateRange) params.dateRange = dateRange;

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

  // 選択中記事をURLの `article` パラメータへ native History API で反映する。
  // router.push/replace を使わないのは、/reader が force-dynamic のため
  // Next Router 経由の遷移は毎回サーバー(sources/tags/session取得)への
  // RSCリクエストを発生させてしまうから。
  const selectArticle = useCallback(
    (id: string, opts?: { replace?: boolean }) => {
      if (typeof window === 'undefined') return;
      const replace = opts?.replace ?? isDesktopRef.current;
      const params = new URLSearchParams(window.location.search);
      params.set('article', id);
      const url = `${window.location.pathname}?${params.toString()}`;
      // data引数には null を渡す（history.state をそのまま渡すと Next.js の
      // 内部フラグ __NA が付いた状態になり、パッチされた pushState/replaceState が
      // 「Next.js内部からの呼び出し」と誤認して useSearchParams への同期処理を
      // スキップしてしまうため。null なら Next.js が現在の内部treeを自動でコピーする）
      if (replace) {
        window.history.replaceState(null, '', url);
      } else {
        window.history.pushState(null, '', url);
      }
    },
    []
  );

  // モバイルの「← 記事リスト」: articleパラメータを外してリスト表示に戻す。
  // history.back() だとdeep link直遷移時に戻り先が存在せずアプリ外に出て
  // しまうことがあるため、常にpushStateでarticleを外す方式にしている。
  const backToList = useCallback(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.delete('article');
    const qs = params.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.pushState(null, '', url);
  }, []);

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

  // Flatten all pages into a single article array
  const articles = useMemo(
    () => listData?.pages.flatMap((p) => p.data.items) ?? [],
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

  // Prev/Next navigation
  const currentIndex = effectiveSelectedId
    ? articles.findIndex((a: ReaderListArticle) => a.id === effectiveSelectedId)
    : -1;
  const isSelectedLoaded = currentIndex >= 0;
  const hasPrev = currentIndex > 0;
  // hasNext: 読み込み済みリスト内に次の記事があるか（handleNext/keyboardの分岐に使用）
  const hasNext = currentIndex >= 0 && currentIndex < articles.length - 1;
  // canGoNextUi: Nextボタンの有効/無効（UI表示用）。
  // 未ロード記事へのdeep link時（currentIndex === -1）はhasNextPageに関わらず無効化する
  const canGoNextUi = isSelectedLoaded && (hasNext || !!hasNextPage);

  // 次ページ取得後の続き選択。Prev/Nextやキーボード連続操作の延長のため常にreplace。
  const fetchNextAndSelect = useCallback(
    (idx: number) => {
      if (!hasNextPage || isFetchingNextPage) return;
      fetchNextPage()
        .then((result) => {
          if (result.data) {
            const newArticles = result.data.pages.flatMap((p) => p.data.items);
            const nextArticle = newArticles[idx + 1];
            if (nextArticle) {
              selectArticle(nextArticle.id, { replace: true });
            }
          }
        })
        .catch(() => {
          // Error handled by useInfiniteQuery's error state
        });
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage, selectArticle]
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
    fetchNextPage().catch(() => {
      // Error handled by useInfiniteQuery's error state
    });
  }, [fetchNextPage]);

  // リストからの選択: モバイルはpush（ブラウザバックでリストへ戻れる）、
  // デスクトップはreplace（履歴を汚さない）
  const handleSelectArticle = useCallback(
    (articleId: string) => {
      selectArticle(articleId);
    },
    [selectArticle]
  );

  // Keyboard navigation（ArrowUp/Down連続操作もPrev/Next同様に常にreplace）
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!effectiveSelectedId || articles.length === 0) return;
      const idx = articles.findIndex(
        (a: ReaderListArticle) => a.id === effectiveSelectedId
      );
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (idx < articles.length - 1) {
          selectArticle(articles[idx + 1].id, { replace: true });
        } else {
          fetchNextAndSelect(idx);
        }
      } else if (e.key === 'ArrowUp' && idx > 0) {
        e.preventDefault();
        selectArticle(articles[idx - 1].id, { replace: true });
      }
    },
    [effectiveSelectedId, articles, fetchNextAndSelect, selectArticle]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-[var(--tt-color-border)] px-4 py-2">
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
          className={cn(
            'shrink-0 overflow-y-auto border-r border-[var(--tt-color-border)] bg-[var(--tt-color-surface-muted)] md:w-[320px] lg:w-[380px]',
            articleParam ? 'hidden md:block' : 'block w-full'
          )}
          role="region"
          aria-label="記事リスト"
        >
          <ReaderArticleList
            articles={articles}
            selectedId={effectiveSelectedId}
            isLoading={isLoadingList}
            error={listError instanceof Error ? listError.message : null}
            onSelectArticle={handleSelectArticle}
            onKeyDown={handleKeyDown}
            onRetry={refetchList}
            hasNextPage={!!hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={handleLoadMore}
          />
        </div>
        {/* Right panel: Article detail */}
        <div
          className={cn(
            'flex-1 overflow-hidden',
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
