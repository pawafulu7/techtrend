'use client';

import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArticleList } from '@/app/components/article/list';
import { ArticleSkeleton } from '@/app/components/article/article-skeleton';
import { InfiniteScrollTrigger } from '@/app/components/common/infinite-scroll-trigger';
import { useInfiniteArticles } from '@/app/hooks/use-infinite-articles';
import { useScrollRestoration } from '@/app/hooks/use-scroll-restoration';
import { buildScrollStorageKey } from '@/lib/utils/scroll';
import type { Source, Tag } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { RecommendationSectionInline } from '@/components/recommendation/recommendation-section-inline';
import { ScrollRestorationLoading } from '@/app/components/common/scroll-restoration-loading';
import { Loader2 } from 'lucide-react';

interface HomeClientInfiniteProps {
  viewMode: 'card' | 'list';
  sources: Source[];
  tags: Array<Tag & { count: number }>;
  enableInfiniteScroll?: boolean;
  initialSortBy?: string;
  initialSourceIds?: string[];
}

export function HomeClientInfinite({
  viewMode,
  sources: _sources,
  tags: _tags,
  enableInfiniteScroll = true,
  initialSortBy,
  initialSourceIds: _initialSourceIds
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
      const scrollY = Math.max(windowScrollY, containerScrollY, mainScrollY, maxScroll);

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

  // カテゴリの変更を検出
  const currentCategory = searchParams.get('category') || 'all';

  useEffect(() => {
    if (previousCategory !== null && previousCategory !== currentCategory) {
      setIsCategoryChanging(true);
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
      if (key !== 'page' && key !== 'limit' && key !== 'returning' && 
          key !== 'sources' && key !== 'sourceId') {
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
      params.sources = searchParams.get('sources')!;
    } else if (hasSourceIdParam) {
      params.sourceId = searchParams.get('sourceId')!;
    }
    
    if (!hasSourcesParam && !hasSourceIdParam) {
      // URLにソース関連のパラメータがまったくない場合 = 全選択
      // Cookieの値は無視して、何も設定しない（全選択として扱う）
      // params.sourcesを設定しない = 全記事を表示
    }

    // 記事詳細から戻ってきた場合のフラグを追加
    if (isReturningFromArticle) {
      params.returning = 'true';
    }

    return params;
  }, [searchParams, initialSortBy, isReturningFromArticle]);

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
    includeUserData: true // Include favorites and read status in API response
  });

  // ページごとの記事を1つの配列にフラット化（重複除去付き）
  const allArticles = useMemo(() => {
    if (!data) return [];
    // flatMapで全ページの記事を取得
    const articles = data.pages.flatMap(page => page.data.items);

    // 重複除去: 同じIDの記事は最初のものだけを保持
    const uniqueArticles = articles.filter((article, index, self) =>
      index === self.findIndex(a => a.id === article.id)
    );

    return uniqueArticles;
  }, [data]);

  // 合計記事数
  const totalCount = data?.pages[0]?.data.total || 0;

  // スクロール位置復元フックを使用（記事詳細から戻った時のみ有効）
  const {
    isRestoring,
    currentPage,
    targetPages,
    cancelRestoration
  } = useScrollRestoration(
    allArticles.length,
    data?.pages.length || 0,
    filters,
    fetchNextPage,
    hasNextPage || false,
    isFetchingNextPage,
    scrollContainerRef,  // スクロールコンテナの参照を追加
    isReturningFromArticle  // 記事詳細から戻ってきたかのフラグ
  );

  // 記事クリック時のコールバック
  const handleArticleClick = useCallback((articleId?: string) => {
    // 追跡していたスクロール位置を保存
    const scrollY = currentScrollPositionRef.current;

    if (scrollY > 50) {
      const scrollKey = buildScrollStorageKey();
      sessionStorage.setItem(scrollKey, JSON.stringify({
        scrollY: scrollY,
        timestamp: Date.now(),
        articleId: articleId || null
      }));
    } else {
      // 小さいスクロール位置は保存しない
    }
  }, []);

  if (isError) {
    return (
      <div className="text-center text-red-500 py-8">
        エラーが発生しました: {error?.message || 'Unknown error'}
      </div>
    );
  }

  return (
    <>
      {/* 記事リスト */}
      <div ref={scrollContainerRef} id="main-scroll-container" className="flex-1 overflow-y-auto px-4 lg:px-6 py-4 relative">
        {/* スクロール位置復元中のローディング表示 */}
        {isRestoring && (
          <ScrollRestorationLoading
            currentPage={currentPage}
            targetPages={targetPages}
            onCancel={cancelRestoration}
          />
        )}
        
        {/* 推薦セクション（インライン） */}
        <RecommendationSectionInline />
        
        {(isLoading || isCategoryChanging) ? (
          <div className="relative">
            {isCategoryChanging && (
              <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-10 flex items-center justify-center">
                <div className="bg-background rounded-lg p-4 shadow-lg flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">カテゴリを切り替え中...</span>
                </div>
              </div>
            )}
            <ArticleSkeleton />
          </div>
        ) : allArticles.length > 0 ? (
          <>
            <ArticleList 
              articles={allArticles} 
              viewMode={viewMode}
              onArticleClick={handleArticleClick}
              currentFilters={filters}
            />
            
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
          </>
        ) : (
          <div className="flex items-center justify-center min-h-[600px]">
            <div className="text-center text-gray-500">
              記事が見つかりませんでした
            </div>
          </div>
        )}
      </div>

      {/* 記事件数表示 */}
      {totalCount > 0 && (
        <div className="text-sm text-gray-600 dark:text-gray-400 px-4 lg:px-6 pb-2">
          {totalCount}件の記事 ({allArticles.length}件表示中)
        </div>
      )}
    </>
  );
}
