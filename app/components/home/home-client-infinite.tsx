'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArticleList } from '@/app/components/article/list';
import { ArticleSkeleton } from '@/app/components/article/article-skeleton';
import { InfiniteScrollTrigger } from '@/app/components/common/infinite-scroll-trigger';
import { useInfiniteArticles } from '@/app/hooks/use-infinite-articles';
import type { Source, Tag } from '@prisma/client';
import { Button } from '@/components/ui/button';

interface HomeClientInfiniteProps {
  viewMode: 'grid' | 'list';
  sources: Source[];
  tags: Array<Tag & { count: number }>;
  enableInfiniteScroll?: boolean;
}

export function HomeClientInfinite({ 
  viewMode, 
  sources, 
  tags,
  enableInfiniteScroll = true 
}: HomeClientInfiniteProps) {
  const searchParams = useSearchParams();
  
  // URLパラメータからフィルターを構築
  const filters = useMemo(() => {
    const params: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      // ページパラメータは除外
      if (key !== 'page' && key !== 'limit') {
        params[key] = value;
      }
    });
    return params;
  }, [searchParams]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteArticles(filters);

  // ページごとの記事を1つの配列にフラット化
  const allArticles = useMemo(() => {
    if (!data) return [];
    return data.pages.flatMap(page => page.data.items);
  }, [data]);

  // 合計記事数
  const totalCount = data?.pages[0]?.data.total || 0;

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
      <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4">
        {isLoading ? (
          <ArticleSkeleton />
        ) : allArticles.length > 0 ? (
          <>
            <ArticleList articles={allArticles} viewMode={viewMode} />
            
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