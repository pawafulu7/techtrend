'use client';

import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArticleList } from '@/app/components/article/list';
import { ArticleSkeleton } from '@/app/components/article/article-skeleton';
import { InfiniteScrollTrigger } from '@/app/components/common/infinite-scroll-trigger';
import { useInfiniteArticles } from '@/app/hooks/use-infinite-articles';
import { useScrollRestoration } from '@/app/hooks/use-scroll-restoration';
import { usePersonalizationPreferences } from '@/lib/hooks/use-personalization-preferences';
import { buildScrollStorageKey } from '@/lib/utils/scroll';
import { PAGINATION, SCROLL } from '@/lib/constants/index';
import type { Source, Tag } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { ScrollRestorationLoading } from '@/app/components/common/scroll-restoration-loading';
import { AlertTriangle, Loader2, Search } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import type { ViewMode } from '@/types/components';

interface HomeClientInfiniteProps {
  viewMode: ViewMode;
  sources: Source[];
  tags: Array<Tag & { count: number }>;
  enableInfiniteScroll?: boolean;
  initialSortBy?: string;
  initialSourceIds?: string[];
  excludeSources?: string; // 除外するソースID（カンマ区切り）
}

export function HomeClientInfinite({
  viewMode,
  sources: _sources,
  tags: _tags,
  enableInfiniteScroll = true,
  initialSortBy,
  initialSourceIds: _initialSourceIds,
  excludeSources,
}: HomeClientInfiniteProps) {
  const searchParams = useSearchParams();
  const scrollContainerRef = useRef<HTMLDivElement>(null); // 参照は保持するが使用しない
  const [previousCategory, setPreviousCategory] = useState<string | null>(null);
  const [isCategoryChanging, setIsCategoryChanging] = useState(false);
  const excludeUnprocessed = true; // デフォルトで要約なし記事を除外（常に有効）
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
    hasPreferences,
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

  // URLパラメータからフィルターを構築
  const filters = useMemo(() => {
    const params: Record<string, string> = {};

    // まず、sources以外のパラメータをコピー
    searchParams.forEach((value, key) => {
      // ページパラメータとreturningパラメータ、そしてsources関連は後で処理
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

    // URLパラメータにsortByがない場合、initialSortByを使用
    if (!params.sortBy && initialSortBy) {
      params.sortBy = initialSortBy;
    }

    // URLパラメータにsourcesがない場合の処理
    // 重要: URLに明示的にsources=noneがある場合と、パラメータがない場合を区別する
    const hasSourcesParam = searchParams.has('sources');
    const hasSourceIdParam = searchParams.has('sourceId');

    // URLにsourcesパラメータがある場合は、それを使用
    if (hasSourcesParam) {
      const sourcesValue = searchParams.get('sources')!;
      // URLの値をそのままAPIに送る（all/none含む）
      params.sources = sourcesValue;
    } else if (hasSourceIdParam) {
      params.sourceId = searchParams.get('sourceId')!;
    } else if (_initialSourceIds !== undefined) {
      // Cookie由来のinitialSourceIdsを使用
      if (_initialSourceIds.length === 0) {
        params.sources = 'none';
      } else {
        params.sources = _initialSourceIds.join(',');
      }
    }
    // URLパラメータなし＆Cookie値なしの場合はsourcesを設定しない（全選択）

    // 記事詳細から戻ってきた場合のフラグを追加
    if (isReturningFromArticle) {
      params.returning = 'true';
    }

    // 処理中記事を除外するフラグを追加
    if (excludeUnprocessed) {
      params.excludeUnprocessed = 'true';
    }

    // パーソナライズフィルターが有効な場合、カテゴリIDと期間を追加
    if (isPersonalized && hasPreferences && personalizedCategories.length > 0) {
      params.personalized = 'true';
      params.categoryIds = personalizedCategories.join(',');
      if (personalizedPeriod > 0) {
        params.periodMonths = String(personalizedPeriod);
      }
    }

    // 特定のソースを除外（例: arXiv論文をホームページから除外）
    if (excludeSources) {
      params.excludeSources = excludeSources;
    }

    return params;
  }, [
    searchParams,
    initialSortBy,
    isReturningFromArticle,
    excludeUnprocessed,
    isPersonalized,
    hasPreferences,
    personalizedCategories,
    personalizedPeriod,
    _initialSourceIds,
    excludeSources,
  ]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteArticles({
    ...filters,
    includeUserData: true, // Include favorites and read status in API response
  });

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

  // 合計記事数
  const totalCount = data?.pages[0]?.data.total || 0;

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

  if (isError) {
    return (
      <div className="flex min-h-[400px] items-center justify-center px-4">
        <CardV2 className="mx-auto max-w-md">
          <div className="flex flex-col items-center justify-center px-4 py-12">
            <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <AlertTriangle
                className="text-muted-foreground h-8 w-8"
                aria-hidden="true"
              />
            </div>
            <p className="text-foreground mb-2 text-lg font-medium">
              エラーが発生しました
            </p>
            <p className="text-muted-foreground mb-6 text-center text-sm">
              記事の読み込みに失敗しました。しばらく経ってから再試行してください。
            </p>
            <Button
              onClick={() => refetch()}
              variant="outline"
              className="min-h-[44px] min-w-[44px]"
            >
              再試行
            </Button>
          </div>
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

        {isLoading && !isCategoryChanging ? (
          <ArticleSkeleton />
        ) : allArticles.length > 0 ? (
          <div className="relative">
            <ArticleList
              articles={allArticles}
              viewMode={viewMode}
              onArticleClick={handleArticleClick}
              currentFilters={filters}
              className={
                isCategoryChanging
                  ? 'pointer-events-none opacity-40'
                  : undefined
              }
            />
            {isCategoryChanging && (
              <div
                className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center"
                role="status"
                aria-live="polite"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span className="sr-only">カテゴリを変更中...</span>
              </div>
            )}

            {/* Infinite Scrollトリガー */}
            {enableInfiniteScroll ? (
              <InfiniteScrollTrigger
                onIntersect={fetchNextPage}
                hasNextPage={hasNextPage || false}
                isFetchingNextPage={isFetchingNextPage}
              />
            ) : (
              hasNextPage && (
                <div className="flex justify-center py-8">
                  <Button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    variant="outline"
                    data-testid="load-more-button"
                  >
                    {isFetchingNextPage ? '読み込み中...' : 'さらに読み込む'}
                  </Button>
                </div>
              )
            )}
          </div>
        ) : isLoading ? (
          <ArticleSkeleton />
        ) : (
          <div className="flex min-h-[400px] items-center justify-center px-4">
            <CardV2 className="mx-auto max-w-md">
              <div className="flex flex-col items-center justify-center px-4 py-12">
                <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                  <Search
                    className="text-muted-foreground h-8 w-8"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-foreground mb-2 text-lg font-medium">
                  記事が見つかりませんでした
                </p>
                <p className="text-muted-foreground mb-6 text-center text-sm">
                  フィルター条件を変更するか、別のカテゴリをお試しください。
                </p>
              </div>
            </CardV2>
          </div>
        )}
      </div>

      {/* 記事件数表示 */}
      {totalCount > 0 && (
        <div className="text-muted-foreground px-4 pb-2 text-right text-sm lg:px-6">
          {totalCount}件の記事 ({allArticles.length}件表示中)
        </div>
      )}
    </>
  );
}
