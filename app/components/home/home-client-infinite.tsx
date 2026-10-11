'use client';

import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArticleList } from '@/app/components/article/list';
import { groupArticlesByStory } from '@/app/components/article/story-grouping';
import { ArticleListSkeleton } from '@/app/components/article/article-list-skeleton';
import { InfiniteScrollTrigger } from '@/app/components/common/infinite-scroll-trigger';
import { useInfiniteArticles } from '@/app/hooks/use-infinite-articles';
import { useScrollRestoration } from '@/app/hooks/use-scroll-restoration';
import { useRefreshKeepingPosition } from '@/app/hooks/use-refresh-keeping-position';
import { usePersonalizationPreferences } from '@/lib/hooks/use-personalization-preferences';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';
import type { HomePersonalization } from '@/lib/personalization/preferences-state';
import { buildHomeArticleFilters } from '@/lib/articles/home-articles-query';
import { buildScrollStorageKey } from '@/lib/utils/scroll';
import { PAGINATION, SCROLL } from '@/lib/constants/index';
import type { Source, Tag } from '@/lib/prisma-exports';
import { Button } from '@/components/ui-v2/button-v2';
import { ScrollRestorationLoading } from '@/app/components/common/scroll-restoration-loading';
import { Loader2 } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { ErrorState } from '@/components/ui-v2/error-state';
import { LiveStatus } from '@/components/ui-v2/live-status';
import type { ViewMode } from '@/types/components';
import { HomeListStatusBar } from '@/app/components/home/home-list-status-bar';
import { HomeEmptyState } from '@/app/components/home/home-empty-state';

interface HomeClientInfiniteProps {
  viewMode: ViewMode;
  sources: Source[];
  tags: Array<Tag & { count: number }>;
  enableInfiniteScroll?: boolean;
  initialSortBy?: string;
  initialSourceIds?: string[];
  excludeSources?: string; // 除外するソースID（カンマ区切り）
  /**
   * サーバーが一覧の1ページ目を先読みしたときのパーソナライズ設定（issue #714）。
   * クライアントでセッションと設定を判定し終えるまで、この値で取得条件を組み立てる。
   * 同じ条件の queryKey にサーバーのページが入っているので、判定を待たずに一覧を出せる
   */
  initialPersonalization?: HomePersonalization;
}

export function HomeClientInfinite({
  viewMode,
  sources: _sources,
  tags: _tags,
  enableInfiniteScroll = true,
  initialSortBy,
  initialSourceIds: _initialSourceIds,
  excludeSources,
  initialPersonalization,
}: HomeClientInfiniteProps) {
  const searchParams = useSearchParams();
  const scrollContainerRef = useRef<HTMLDivElement>(null); // 参照は保持するが使用しない
  const [previousCategory, setPreviousCategory] = useState<string | null>(null);
  const [isCategoryChanging, setIsCategoryChanging] = useState(false);
  const currentScrollPositionRef = useRef<number>(0); // 現在のスクロール位置を常に追跡

  // 記事詳細から戻ってきたかどうかをチェック
  const isReturningFromArticle = searchParams.has('returning');

  // スクロール位置を常に追跡
  useEffect(() => {
    const handleScroll = (_e?: Event) => {
      // まずwindowのスクロール位置を確認
      const windowScrollY = window.scrollY || window.pageYOffset || 0;

      // 次にスクロールコンテナの位置を確認
      const container = scrollContainerRef.current;
      const containerScrollY = container ? container.scrollTop : 0;

      // 実際のスクロール要素を特定（overflow-y-autoを持つ要素）
      const mainContainer = document.getElementById('main-scroll-container');
      const mainScrollY = mainContainer ? mainContainer.scrollTop : 0;

      // overflow-y-autoを持つすべての要素をチェック
      const scrollableElements = document.querySelectorAll('.overflow-y-auto');
      let maxScroll = 0;
      scrollableElements.forEach((el) => {
        const scrollTop = (el as HTMLElement).scrollTop;
        if (scrollTop > maxScroll) {
          maxScroll = scrollTop;
        }
      });

      // 最も大きい値を使用（実際にスクロールしている要素を検出）
      const scrollY = Math.max(
        windowScrollY,
        containerScrollY,
        mainScrollY,
        maxScroll
      );

      currentScrollPositionRef.current = scrollY;
    };

    // 初期位置を記録
    handleScroll();

    // 複数の要素にリスナーを追加
    window.addEventListener('scroll', handleScroll, { passive: true });

    // スクロールコンテナにもリスナーを追加
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
    }

    // main-scroll-containerにもリスナーを追加
    const mainContainer = document.getElementById('main-scroll-container');
    if (mainContainer) {
      mainContainer.addEventListener('scroll', handleScroll, { passive: true });
    }

    // overflow-y-autoを持つすべての要素にリスナーを追加
    const scrollableElements = document.querySelectorAll('.overflow-y-auto');
    scrollableElements.forEach((el) => {
      el.addEventListener('scroll', handleScroll, { passive: true });
    });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
      if (mainContainer) {
        mainContainer.removeEventListener('scroll', handleScroll);
      }
      scrollableElements.forEach((el) => {
        el.removeEventListener('scroll', handleScroll);
      });
    };
  }, []);

  // パーソナライズフィルター設定を取得
  const {
    selectedCategories: personalizedCategories,
    filterEnabled: isPersonalized,
    periodMonths: personalizedPeriod,
    isLoadingPreferences,
  } = usePersonalizationPreferences();

  // カテゴリの変更を検出
  const currentCategory = searchParams.get('category') || 'all';

  useEffect(() => {
    if (previousCategory !== null && previousCategory !== currentCategory) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: track category changes for loading state
      setIsCategoryChanging(true);
      // Update previous category to detect next change (fixes one-time detection issue)
      setPreviousCategory(currentCategory);
      // 短い遅延後にローディング状態を解除
      const timer = setTimeout(() => {
        setIsCategoryChanging(false);
      }, 300);
      return () => clearTimeout(timer);
    }
    setPreviousCategory(currentCategory);
  }, [currentCategory, previousCategory]);

  // URLパラメータからフィルターを構築。
  // サーバーが1ページ目を先読みしたときは、hydration が終わり、クライアントで設定の判定が
  // 一度済むまで、サーバーが使った設定で組み立てる（issue #714）。
  // - hydration 中はサーバー描画と同じ条件にする（設定の判定が hydration より先に済んでも、
  //   条件が変わると一覧が食い違うため）
  // - 判定が済んで同じ設定なら queryKey は変わらず、1ページ目を取り直さない
  // - 一度判定が済んだ後（ユーザーが変わった等）は、サーバーの設定に戻らない
  const isHydrated = useIsHydrated();
  const [hasResolvedPreferences, setHasResolvedPreferences] = useState(false);
  if (isHydrated && !isLoadingPreferences && !hasResolvedPreferences) {
    // 同一コンポーネントに対するレンダー中の setState（React が許可する形）
    setHasResolvedPreferences(true);
  }
  const shouldUseServerPersonalization =
    initialPersonalization !== undefined && !hasResolvedPreferences;
  const personalizationForFilters = useMemo<HomePersonalization>(
    () =>
      shouldUseServerPersonalization && initialPersonalization
        ? initialPersonalization
        : {
            filterEnabled: isPersonalized,
            selectedCategories: personalizedCategories,
            periodMonths: personalizedPeriod,
          },
    [
      shouldUseServerPersonalization,
      initialPersonalization,
      isPersonalized,
      personalizedCategories,
      personalizedPeriod,
    ]
  );

  const filters = useMemo(
    () =>
      buildHomeArticleFilters({
        searchParams,
        initialSortBy,
        initialSourceIds: _initialSourceIds,
        personalization: personalizationForFilters,
        excludeSources,
      }),
    [
      searchParams,
      initialSortBy,
      _initialSourceIds,
      personalizationForFilters,
      excludeSources,
    ]
  );

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    isError,
    isRefetchError,
    isFetching,
    errorUpdateCount,
    isFetchNextPageError,
    refetch,
  } = useInfiniteArticles(
    {
      ...filters,
      includeUserData: true, // Include favorites and read status in API response
    },
    { enabled: !isLoadingPreferences }
  );

  // ページごとの記事を1つの配列にフラット化（重複除去付き）
  const allArticles = useMemo(() => {
    if (!data) return [];
    // flatMapで全ページの記事を取得
    const articles = data.pages.flatMap((page) => page.data.items);

    // 重複除去: 同じIDの記事は最初のものだけを保持
    const uniqueArticles = articles.filter(
      (article, index, self) =>
        index === self.findIndex((a) => a.id === article.id)
    );

    return uniqueArticles;
  }, [data]);

  // 一覧に描画する記事の ID（同じストーリーの記事は代表だけ。issue #723）。
  // 手動更新の位置合わせは、DOM の記事の並びとこの並びが一致するのを待つ
  const articleIds = useMemo(
    () => groupArticlesByStory(allArticles).map((group) => group.article.id),
    [allArticles]
  );

  // 合計記事数
  const totalCount = data?.pages[0]?.data.total || 0;
  // 一覧の先頭ページを取得した時刻（新着の有無はここで決まる）
  const fetchedAt = data?.pages[0]?.fetchedAt;

  // 手動更新（issue #707）。読んでいる位置を保ったまま最新の一覧に取り直す
  const { isRefreshing, refresh: handleRefresh } = useRefreshKeepingPosition({
    containerRef: scrollContainerRef,
    refetch,
    fetchedAt,
    articleIds,
    listKey: JSON.stringify(filters),
  });
  // 手動更新の間は次ページを読まない（fetchNextPage は進行中の取り直しを取り消すため）。
  // hasNextPage は変えない（変えると「すべての記事を読み込みました」と出てしまう）
  const loadNextPage = useCallback(() => {
    if (!isRefreshing) void fetchNextPage();
  }, [isRefreshing, fetchNextPage]);

  // スクロール位置復元フックを使用（記事詳細から戻った時のみ有効）
  const { isRestoring, currentPage, targetPages, cancelRestoration } =
    useScrollRestoration(
      allArticles.length,
      data?.pages.length || 0,
      filters,
      fetchNextPage,
      hasNextPage || false,
      isFetchingNextPage,
      scrollContainerRef, // スクロールコンテナの参照を追加
      isReturningFromArticle // 記事詳細から戻ってきたかのフラグ
    );

  // 記事クリック時のコールバック
  const handleArticleClick = useCallback(
    (articleId?: string) => {
      // 追跡していたスクロール位置を保存
      const scrollY = currentScrollPositionRef.current;

      if (scrollY > SCROLL.MIN_SCROLL_SAVE_THRESHOLD) {
        // articleIdがある場合のみ記事のインデックスを取得
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
          // Safari Private Browsing等での保存失敗時は復元なしでフォールバック
          // console.warn('Failed to save scroll position to sessionStorage');
        }
      } else {
        // 小さいスクロール位置は保存しない
      }
    },
    [allArticles]
  );

  // 一覧が無い状態での失敗。React Query は data の無いクエリを再取得すると pending に戻すので、
  // 一度失敗したら再試行中も失敗の表示（再試行中…）を残す（issue #701）。
  // 更新（取り直し）の失敗では一覧を残し、失敗を下の行に出す
  if (!data && (isError || errorUpdateCount > 0)) {
    return (
      <div className="flex min-h-[400px] items-center justify-center px-4">
        <CardV2 className="mx-auto max-w-md">
          <ErrorState
            size="block"
            title="記事を読み込めませんでした"
            description="時間をおいて再試行してください。"
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        </CardV2>
      </div>
    );
  }

  return (
    <>
      {/* 記事リスト */}
      <div
        ref={scrollContainerRef}
        id="main-scroll-container"
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

        {/* isPending は data === undefined と厳密に等価（v5 の isLoading は
            isPending && isFetching）。データが無いときだけスケルトンを出すため、
            再取得中やセッション判定中に一覧 DOM を破棄しない。 */}
        {isPending && !isCategoryChanging ? (
          <ArticleListSkeleton viewMode={viewMode} />
        ) : allArticles.length > 0 ? (
          <div className="relative">
            <ArticleList
              articles={allArticles}
              viewMode={viewMode}
              onArticleClick={handleArticleClick}
              groupStories
              currentFilters={filters}
              className={
                isCategoryChanging
                  ? 'pointer-events-none opacity-40'
                  : undefined
              }
            />
            {isCategoryChanging && (
              <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {/* 領域を先に描いてから文言を入れる（issue 701） */}
                <LiveStatus message="カテゴリを変更中..." />
              </div>
            )}

            {/* 続きのページの失敗は下端に出し、続きだけを再試行する（issue #701）。
                自動の取得（トリガー）は止める。残すと末尾が見えている間、失敗した取得をくり返すため */}
            {isFetchNextPageError ? (
              <ErrorState
                title="続きを読み込めませんでした"
                description="時間をおいて再試行してください。"
                onRetry={loadNextPage}
                retrying={isFetchingNextPage}
                className="mt-4"
              />
            ) : enableInfiniteScroll ? (
              <InfiniteScrollTrigger
                onIntersect={loadNextPage}
                hasNextPage={hasNextPage || false}
                isFetchingNextPage={isFetchingNextPage}
              />
            ) : (
              hasNextPage && (
                <div className="flex justify-center py-8">
                  <Button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage || isRefreshing}
                    variant="outline"
                    data-testid="load-more-button"
                  >
                    {isFetchingNextPage ? '読み込み中...' : 'さらに読み込む'}
                  </Button>
                </div>
              )
            )}
          </div>
        ) : isPending ? (
          <ArticleListSkeleton viewMode={viewMode} />
        ) : (
          <HomeEmptyState
            personalized={
              personalizationForFilters.filterEnabled &&
              personalizationForFilters.selectedCategories.length > 0
            }
          />
        )}
      </div>

      {/* 一覧の取得時刻・手動更新・記事件数 */}
      {data && (
        <HomeListStatusBar
          fetchedAt={fetchedAt}
          isRefreshing={isRefreshing}
          refreshDisabled={isFetchingNextPage || isRestoring}
          refreshFailed={isRefetchError}
          onRefresh={() => void handleRefresh()}
          totalCount={totalCount}
          shownCount={allArticles.length}
        />
      )}
    </>
  );
}
