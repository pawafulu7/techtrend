'use client';

import { useMemo, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArticleList } from '@/app/components/article/list';
import { ArticleSkeleton } from '@/app/components/article/article-skeleton';
import { InfiniteScrollTrigger } from '@/app/components/common/infinite-scroll-trigger';
import { useInfiniteArticles } from '@/app/hooks/use-infinite-articles';
import { useScrollRestoration } from '@/app/hooks/use-scroll-restoration';
import { buildScrollStorageKey } from '@/lib/utils/scroll';
import { PAGINATION, SCROLL } from '@/lib/constants/index';
import { ScrollRestorationLoading } from '@/app/components/common/scroll-restoration-loading';
import type { ViewMode } from '@/types/components';

interface PapersClientInfiniteProps {
  viewMode: ViewMode;
  sourceId: string; // arXiv source ID
  initialSortBy?: string;
}

export function PapersClientInfinite({
  viewMode,
  sourceId,
  initialSortBy,
}: PapersClientInfiniteProps) {
  const searchParams = useSearchParams();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentScrollPositionRef = useRef<number>(0);
  const excludeUnprocessed = true;

  // 記事詳細から戻ってきたかどうかをチェック
  const isReturningFromArticle = searchParams.has('returning');

  // スクロール位置を常に追跡
  useEffect(() => {
    const handleScroll = () => {
      const windowScrollY = window.scrollY || window.pageYOffset || 0;
      const container = scrollContainerRef.current;
      const containerScrollY = container ? container.scrollTop : 0;
      const mainContainer = document.getElementById('papers-scroll-container');
      const mainScrollY = mainContainer ? mainContainer.scrollTop : 0;

      const scrollY = Math.max(windowScrollY, containerScrollY, mainScrollY);
      currentScrollPositionRef.current = scrollY;
    };

    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
    }

    const mainContainer = document.getElementById('papers-scroll-container');
    if (mainContainer) {
      mainContainer.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
      if (mainContainer) {
        mainContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  // URLパラメータからフィルターを構築（arXivソースに固定）
  const filters = useMemo(() => {
    const params: Record<string, string> = {};

    // URLパラメータからsearch, tag, sortBy等をコピー
    searchParams.forEach((value, key) => {
      if (
        key !== 'page' &&
        key !== 'limit' &&
        key !== 'returning' &&
        key !== 'sources' &&
        key !== 'sourceId'
      ) {
        params[key] = value;
      }
    });

    // ソースIDを固定（arXiv論文のみ）
    params.sourceId = sourceId;

    // URLパラメータにsortByがない場合、initialSortByを使用
    if (!params.sortBy && initialSortBy) {
      params.sortBy = initialSortBy;
    }

    // 記事詳細から戻ってきた場合のフラグを追加
    if (isReturningFromArticle) {
      params.returning = 'true';
    }

    // 処理中記事を除外するフラグを追加
    if (excludeUnprocessed) {
      params.excludeUnprocessed = 'true';
    }

    return params;
  }, [
    searchParams,
    sourceId,
    initialSortBy,
    isReturningFromArticle,
    excludeUnprocessed,
  ]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteArticles({
    ...filters,
    includeUserData: true,
  });

  // ページごとの記事を1つの配列にフラット化（重複除去付き）
  const allArticles = useMemo(() => {
    if (!data) return [];
    const articles = data.pages.flatMap((page) => page.data.items);

    // 重複除去
    const uniqueArticles = articles.filter(
      (article, index, self) =>
        index === self.findIndex((a) => a.id === article.id)
    );

    return uniqueArticles;
  }, [data]);

  // スクロール位置復元フック
  const { isRestoring, currentPage, targetPages, cancelRestoration } =
    useScrollRestoration(
      allArticles.length,
      data?.pages.length || 0,
      filters,
      fetchNextPage,
      hasNextPage || false,
      isFetchingNextPage,
      scrollContainerRef,
      isReturningFromArticle
    );

  // 記事クリック時のコールバック
  const handleArticleClick = useCallback(
    (articleId?: string) => {
      const scrollY = currentScrollPositionRef.current;

      if (scrollY > SCROLL.MIN_SCROLL_SAVE_THRESHOLD) {
        const idx = articleId
          ? allArticles.findIndex((a) => a.id === articleId)
          : -1;

        const scrollKey = buildScrollStorageKey();
        const payload = {
          scrollY,
          timestamp: Date.now(),
          articleId: articleId ?? null,
          articleIndex: idx >= 0 ? idx : undefined,
          totalArticlesLoaded: allArticles.length,
        };

        try {
          sessionStorage.setItem(scrollKey, JSON.stringify(payload));
        } catch {
          // Safari Private Browsing等での保存失敗時は無視
        }
      }
    },
    [allArticles]
  );

  if (isError) {
    return (
      <div className="py-8 text-center text-red-500">
        エラーが発生しました: {error?.message || 'Unknown error'}
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      id="papers-scroll-container"
      className="relative flex-1 overflow-y-auto px-4 py-4 lg:px-6"
    >
      {/* スクロール位置復元中のローディング表示 */}
      {isRestoring && (
        <ScrollRestorationLoading
          currentPage={currentPage}
          targetPages={targetPages}
          onCancel={cancelRestoration}
          itemsPerPage={PAGINATION.ITEMS_PER_PAGE}
        />
      )}

      {isLoading ? (
        <ArticleSkeleton />
      ) : allArticles.length > 0 ? (
        <div className="relative">
          <ArticleList
            articles={allArticles}
            viewMode={viewMode}
            onArticleClick={handleArticleClick}
            currentFilters={filters}
          />

          {/* Infinite Scrollトリガー */}
          <InfiniteScrollTrigger
            onIntersect={fetchNextPage}
            hasNextPage={hasNextPage || false}
            isFetchingNextPage={isFetchingNextPage}
          />
        </div>
      ) : (
        <div className="text-muted-foreground py-12 text-center">
          論文が見つかりませんでした
        </div>
      )}

      {/* ページネーションフォールバック */}
      {!hasNextPage && allArticles.length > 0 && (
        <div className="text-muted-foreground py-8 text-center text-sm">
          すべての論文を表示しました
        </div>
      )}
    </div>
  );
}
