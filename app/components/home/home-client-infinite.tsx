'use client';

import { useMemo, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArticleList } from '@/app/components/article/list';
import { groupArticlesByStory } from '@/app/components/article/story-grouping';
import { ArticleListSkeleton } from '@/app/components/article/article-list-skeleton';
import { InfiniteScrollTrigger } from '@/app/components/common/infinite-scroll-trigger';
import { useInfiniteArticles } from '@/app/hooks/use-infinite-articles';
import { useScrollRestoration } from '@/app/hooks/use-scroll-restoration';
import { useRefreshKeepingPosition } from '@/app/hooks/use-refresh-keeping-position';
import { useInitialPersonalization } from '@/app/hooks/use-initial-personalization';
import type { HomePersonalization } from '@/lib/personalization/preferences-state';
import {
  buildHomeArticleFilters,
  normalizeArticleFilters,
} from '@/lib/articles/home-articles-query';
import { buildScrollStorageKey } from '@/lib/utils/scroll';
import { PAGINATION, SCROLL } from '@/lib/constants/index';
import type { Source, Tag } from '@/lib/prisma-exports';
import { Button } from '@/components/ui-v2/button-v2';
import { ScrollRestorationLoading } from '@/app/components/common/scroll-restoration-loading';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { ErrorState } from '@/components/ui-v2/error-state';
import { SiteGateReopenState } from '@/app/components/common/site-gate-reopen-state';
import { isSiteGateArticlesError } from '@/lib/articles/articles-fetch-error';
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
  // 一覧のスクロール領域（条件を変えたときに先頭へ戻す・手動更新で位置を保つ・位置の復元に使う）
  const scrollContainerRef = useRef<HTMLDivElement>(null);
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

  // 一覧の取得条件に使うパーソナライズ設定。サーバーが1ページ目を先読みしたときは、設定の判定が
  // 一度済むまでサーバーが使った設定で組み立てる（issue #714。use-initial-personalization.ts）
  const {
    personalization: personalizationForFilters,
    isLoadingPreferences,
  } = useInitialPersonalization(initialPersonalization);

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
  // 取得条件の識別（条件が変わったか・手動更新の対象の一覧か）。URL の引数の並びが違うだけなら同じにする
  const filterKey = useMemo(
    () => JSON.stringify(normalizeArticleFilters(filters)),
    [filters]
  );

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    error,
    isError,
    isRefetchError,
    isFetching,
    errorUpdateCount,
    isFetchNextPageError,
    isPlaceholderData,
    refetch,
  } = useInfiniteArticles(
    {
      ...filters,
      includeUserData: true, // Include favorites and read status in API response
    },
    // 並び順・絞り込みを変えたら、新しい一覧が届くまで前の一覧を薄くして残す（isPlaceholderData）。
    // スケルトンに置き換えると、一覧全体がほぼ白い画面に一瞬切り替わるため
    { enabled: !isLoadingPreferences, keepPreviousData: true }
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
    listKey: filterKey,
  });
  // 手動更新の間は次ページを読まない（fetchNextPage は進行中の取り直しを取り消すため）。
  // hasNextPage は変えない（変えると「すべての記事を読み込みました」と出てしまう）
  // 前の一覧を残している間も読まない。その間に読むと、新しい条件の1ページ目を取り直してしまう
  // （前の一覧の末尾の欄はその間は描かないので、ふつうはここまで来ない）
  const loadNextPage = useCallback(() => {
    if (!isRefreshing && !isPlaceholderData) void fetchNextPage();
  }, [isRefreshing, isPlaceholderData, fetchNextPage]);


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

  // 条件を変えたら先頭に戻す（新しい一覧は先頭から読む）。一覧の部品は条件を変えても作り直さないので、
  // 何もしないと前の一覧のスクロール位置が残る。取り直しを待たずに出せる（キャッシュにある）条件でも戻す。
  // 記事詳細から戻ったとき（部品を新しく作るとき）は、スクロール位置の復元に任せる。
  // 復元の途中で条件を変えたら復元を止める（続けると、前の条件の位置を目指して新しい条件のページを読み進める）
  const prevFilterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKeyRef.current === filterKey) return;
    prevFilterKeyRef.current = filterKey;
    if (isRestoring) cancelRestoration();
    const container = scrollContainerRef.current;
    if (container) container.scrollTop = 0;
  }, [filterKey, isRestoring, cancelRestoration]);

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
  // 再試行中は前の一覧が data に入る（isPlaceholderData）ので、それも「一覧が無い」として扱う
  // （前の一覧に戻すと、成功したように見える）。更新（取り直し）の失敗では一覧を残し、失敗を下の行に出す
  // サイトの入口（Google ログイン）が切れた・取り消された: 再試行しても同じなので、一覧（続きのページの失敗を含む）
  // の代わりにページを開き直す案内だけを出す（お気に入りと同じ）
  if (isSiteGateArticlesError(error)) {
    return (
      <div className="flex min-h-[400px] items-center justify-center px-4">
        <CardV2 className="mx-auto max-w-md">
          <SiteGateReopenState />
        </CardV2>
      </div>
    );
  }

  if (
    (!data || isPlaceholderData) &&
    (isError || errorUpdateCount > 0)
  ) {
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
      {/* 前の一覧を残している間の印。一覧の領域の上端に走査線を流す（globals.css の .list-scan）。
          スクロールしない親（page.tsx の relative な領域）に合わせて置き、一覧の配置は変えない */}
      {isPlaceholderData && (
        <>
          <div
            aria-hidden="true"
            className="list-scan pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5"
            data-testid="home-list-loading"
          />
          <LiveStatus message="記事を読み込んでいます" />
        </>
      )}
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
            再取得中やセッション判定中に一覧 DOM を破棄しない。
            前の一覧が空だったときは残すものが無いので、空の表示ではなくスケルトンを出す */}
        {isPending ? (
          <ArticleListSkeleton viewMode={viewMode} />
        ) : allArticles.length > 0 ? (
          // 前の一覧は操作できないようにする（inert。マウスもキーボードも。カードの中には
          // group-focus-within で操作を受け付ける部品があり、pointer-events だけでは止まらない）
          <div
            className="relative"
            aria-busy={isPlaceholderData || undefined}
            inert={isPlaceholderData || undefined}
          >
            <ArticleList
              articles={allArticles}
              viewMode={viewMode}
              onArticleClick={handleArticleClick}
              groupStories
              currentFilters={filters}
              // 前の一覧は薄くする。すぐ届く（100ms 未満）ときに薄くなる瞬間を見せないよう、
              // 薄くするのは遅らせ、戻すのはすぐに行う
              className={
                isPlaceholderData
                  ? 'opacity-60 transition-opacity delay-100 duration-150 ease-out'
                  : 'transition-opacity duration-150 ease-out'
              }
            />

            {/* 続きのページの失敗は下端に出し、続きだけを再試行する（issue #701）。
                自動の取得（トリガー）は止める。残すと末尾が見えている間、失敗した取得をくり返すため。
                前の一覧を残している間は何も出さない（hasNextPage は新しい条件の側で決まり、まだ false なので、
                出すと「すべての記事を読み込みました」が出る） */}
            {isPlaceholderData ? null : isFetchNextPageError ? (
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
                    disabled={
                      isFetchingNextPage || isRefreshing || isPlaceholderData
                    }
                    variant="outline"
                    data-testid="load-more-button"
                  >
                    {isFetchingNextPage ? '読み込み中...' : 'さらに読み込む'}
                  </Button>
                </div>
              )
            )}
          </div>
        ) : isPlaceholderData ? (
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
          // 前の一覧を残している間も押せない（前の一覧の位置を、新しい条件の一覧の位置として覚えるため）
          refreshDisabled={isFetchingNextPage || isRestoring || isPlaceholderData}
          refreshFailed={isRefetchError}
          onRefresh={() => void handleRefresh()}
          totalCount={totalCount}
          shownCount={allArticles.length}
        />
      )}
    </>
  );
}
