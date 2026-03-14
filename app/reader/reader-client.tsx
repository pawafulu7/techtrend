'use client';

import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  useInfiniteQuery,
  useQuery,
  keepPreviousData,
} from '@tanstack/react-query';
import { ARXIV_SOURCE_ID } from '@/lib/constants/source-categories';
import { FilterSidebarToggle } from '@/app/components/home/filter-sidebar';
import { SearchBox } from '@/app/components/common/search-box';
import { TagFilterDropdown } from '@/app/components/common/tag-filter-dropdown';
import { SortButtons } from '@/app/components/common/sort-buttons';
import { ReaderArticleList } from './article-list';
import { ReaderArticleDetail } from './article-detail';
import type {
  ReaderListArticle,
  ArticleListResponse,
  ArticleDetailResponse,
} from './types';

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

  // key forces remount (and selectedId reset) when filters change
  const filterKey = searchParams.toString();

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
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  // Auto-select first article
  const effectiveSelectedId = selectedId ?? articles[0]?.id ?? null;

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
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < articles.length - 1;

  const fetchNextAndSelect = useCallback(
    (idx: number) => {
      if (!hasNextPage || isFetchingNextPage) return;
      fetchNextPage()
        .then((result) => {
          if (result.data) {
            const newArticles = result.data.pages.flatMap((p) => p.data.items);
            const nextArticle = newArticles[idx + 1];
            if (nextArticle) {
              setSelectedId(nextArticle.id);
            }
          }
        })
        .catch(() => {
          // Error handled by useInfiniteQuery's error state
        });
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  const handlePrev = useCallback(() => {
    if (hasPrev) setSelectedId(articles[currentIndex - 1].id);
  }, [hasPrev, articles, currentIndex]);

  const handleNext = useCallback(() => {
    if (hasNext) {
      setSelectedId(articles[currentIndex + 1].id);
    } else {
      fetchNextAndSelect(currentIndex);
    }
  }, [hasNext, articles, currentIndex, fetchNextAndSelect]);

  const handleLoadMore = useCallback(() => {
    fetchNextPage().catch(() => {
      // Error handled by useInfiniteQuery's error state
    });
  }, [fetchNextPage]);

  const handleSelectArticle = useCallback((articleId: string) => {
    setSelectedId(articleId);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!effectiveSelectedId || articles.length === 0) return;
      const idx = articles.findIndex(
        (a: ReaderListArticle) => a.id === effectiveSelectedId
      );
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (idx < articles.length - 1) {
          setSelectedId(articles[idx + 1].id);
        } else {
          fetchNextAndSelect(idx);
        }
      } else if (e.key === 'ArrowUp' && idx > 0) {
        e.preventDefault();
        setSelectedId(articles[idx - 1].id);
      }
    },
    [effectiveSelectedId, articles, fetchNextAndSelect]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
        <FilterSidebarToggle />
        <SearchBox />
        <TagFilterDropdown tags={tags} />
        <SortButtons />
      </div>
      {/* Two-panel layout */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left panel: Article list */}
        <div
          className="w-[380px] shrink-0 overflow-y-auto border-r border-slate-200 bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:border-slate-700 dark:from-slate-900 dark:via-slate-900/80 dark:to-slate-900"
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
          className="flex-1 overflow-y-auto"
          role="region"
          aria-label="記事詳細"
        >
          <ReaderArticleDetail
            article={selectedArticle}
            isLoading={!detailData && isFetchingDetail}
            error={detailError instanceof Error ? detailError.message : null}
            hasPrev={hasPrev}
            hasNext={hasNext || !!hasNextPage}
            onPrev={handlePrev}
            onNext={handleNext}
          />
        </div>
      </div>
    </div>
  );
}
