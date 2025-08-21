'use client';

import { useMemo, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArticleList } from '@/app/components/article/list';
import { ArticleSkeleton } from '@/app/components/article/article-skeleton';
import { InfiniteScrollTrigger } from '@/app/components/common/infinite-scroll-trigger';
import { useInfiniteArticles } from '@/app/hooks/use-infinite-articles';
import { useScrollRestoration } from '@/app/hooks/use-scroll-restoration';
import type { Source, Tag } from '@prisma/client';
import { Button } from '@/components/ui/button';

interface HomeClientInfiniteProps {
  viewMode: 'grid' | 'list';
  sources: Source[];
  tags: Array<Tag & { count: number }>;
  enableInfiniteScroll?: boolean;
  initialSortBy?: string;
  initialSourceIds?: string[];
}

export function HomeClientInfinite({ 
  viewMode, 
  sources, 
  tags,
  enableInfiniteScroll = true,
  initialSortBy,
  initialSourceIds
}: HomeClientInfiniteProps) {
  const searchParams = useSearchParams();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // 記事詳細から戻ってきたかどうかをチェック
  const isReturningFromArticle = searchParams.has('returning');
  
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
    
    return params;
  }, [searchParams, initialSortBy, initialSourceIds, sources]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useInfiniteArticles(filters);

  // ページごとの記事を1つの配列にフラット化
  const allArticles = useMemo(() => {
    if (!data) return [];
    return data.pages.flatMap(page => page.data.items);
  }, [data]);

  // 合計記事数
  const totalCount = data?.pages[0]?.data.total || 0;

  // スクロール位置復元フックを使用（記事詳細から戻った時のみ有効）
  const { saveScrollPosition, isRestoring } = useScrollRestoration(
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
  const handleArticleClick = useCallback(() => {
    saveScrollPosition();
  }, [saveScrollPosition]);

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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 lg:px-6 py-4">
        {isLoading ? (
          <ArticleSkeleton />
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