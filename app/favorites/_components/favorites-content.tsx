'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Heart, Search } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { PageHeader } from '@/components/ui-v2/page-header';
import { InfiniteScrollTrigger } from '@/app/components/common/infinite-scroll-trigger';
import { Button } from '@/components/ui-v2/button-v2';
import { FavoriteArticleCard } from '@/app/components/article/favorite-card';
import { EmptyState } from '@/components/ui-v2/empty-state';
import { LiveStatus } from '@/components/ui-v2/live-status';
import { FavoritesLoading } from './favorites-loading';
import { useInfiniteFavorites } from '@/app/hooks/use-infinite-favorites';
import { useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth/auth-client';
import type { SortOption } from '../_types';
import { FavoritesToolbar } from './favorites-toolbar';
import { ErrorState } from '@/components/ui-v2/error-state';
import { toast } from '@/hooks/use-toast';

// 解除に失敗して一覧に戻すときは、黙って戻さずに通知する（issue #701）
function notifyRemoveFailed() {
  toast({
    title: 'エラー',
    description: 'お気に入りの解除に失敗しました。もう一度お試しください。',
    variant: 'destructive',
  });
}

interface FavoritesContentProps {
  initialQuery: string;
  initialSort: SortOption;
}

export function FavoritesContent({
  initialQuery,
  initialSort,
}: FavoritesContentProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // トグル同期イベントに載せる（app/hooks/use-favorite-statuses.ts が、別ユーザーの
  // トグル完了でユーザーごとのキャッシュを書き換えないため）
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const emptyStateRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [sortOption, setSortOption] = useState<SortOption>(initialSort);

  const {
    allFavorites,
    totalCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    removeFavoriteFromCache,
    data,
    refetch,
    isFetching,
    errorUpdateCount,
    isFetchNextPageError,
  } = useInfiniteFavorites({ limit: 20, includeRelations: true });
  // 取得に失敗して一覧が無い: 「0件」や空状態ではなく失敗と再試行を出す（issue #701）。
  // React Query は data の無いクエリを再取得すると pending に戻すので、失敗後の再試行中も失敗表示を残す
  const failedWithoutData =
    data === undefined && (!!error || errorUpdateCount > 0);
  // 取得済みの一覧がある状態で再取得に失敗した: 一覧を残して古いことを示す。続きのページの
  // 取得の失敗は一覧の下端に出し、全ページを取り直さず続きだけを再試行する（スクロール位置を失わないため）
  const staleAfterError =
    !!error && data !== undefined && !isFetchNextPageError;

  // Filter and sort favorites
  const filteredFavorites = useMemo(() => {
    // Search filter (title and summary)
    const result = searchQuery.trim()
      ? allFavorites.filter((article) => {
          const query = searchQuery.toLowerCase();
          return (
            article.title.toLowerCase().includes(query) ||
            article.translatedTitle?.toLowerCase().includes(query) ||
            article.summary?.toLowerCase().includes(query)
          );
        })
      : [...allFavorites];

    // Sort with stable tiebreaker
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortOption) {
        case 'favoritedAt-desc':
          comparison =
            new Date(b.favoritedAt).getTime() -
            new Date(a.favoritedAt).getTime();
          break;
        case 'favoritedAt-asc':
          comparison =
            new Date(a.favoritedAt).getTime() -
            new Date(b.favoritedAt).getTime();
          break;
        case 'publishedAt-desc':
          comparison =
            new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime();
          break;
        default:
          break;
      }
      // Stable tiebreaker: use ID when dates are equal
      if (comparison === 0) {
        return a.id.localeCompare(b.id);
      }
      return comparison;
    });

    return result;
  }, [allFavorites, searchQuery, sortOption]);

  // Update URL when filters change (only if URL actually differs)
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (sortOption !== 'favoritedAt-desc') params.set('sort', sortOption);

    const newParamsString = params.toString();
    const currentParamsString = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.search : ''
    ).toString();

    // Only update URL if it actually changed
    if (newParamsString !== currentParamsString) {
      const newUrl = newParamsString ? `?${newParamsString}` : '/favorites';
      router.replace(newUrl, { scroll: false });
    }
  }, [searchQuery, sortOption, router]);

  // Handle tag click
  const handleTagClick = useCallback(
    (tagName: string) => {
      router.push(`/?tags=${encodeURIComponent(tagName)}&tagMode=OR`);
    },
    [router]
  );

  // Handle favorite removal (optimistic cache update + API call)
  const handleRemoveFavorite = useCallback(
    async (articleId: string) => {
      // Optimistic cache update
      removeFavoriteFromCache(articleId);

      try {
        const response = await fetch(`/api/favorites/${articleId}`, {
          method: 'DELETE',
        });

        // 404 = 既に未登録。サーバーの状態は解除済みなので成功と同じ扱いにする
        if (!response.ok && response.status !== 404) {
          // Non-OK response: invalidate query to restore from server
          queryClient.invalidateQueries({ queryKey: ['infinite-favorites'] });
          notifyRemoveFailed();
          return;
        }

        // Dispatch event for cross-screen cache sync
        window.dispatchEvent(
          new CustomEvent('article-favorite-changed', {
            detail: {
              articleId,
              isFavorited: false,
              timestamp: Date.now(),
              userId,
            },
          })
        );
      } catch {
        // Network error: invalidate query to restore from server
        queryClient.invalidateQueries({ queryKey: ['infinite-favorites'] });
        notifyRemoveFailed();
      }
    },
    [removeFavoriteFromCache, queryClient, userId]
  );

  // Focus on empty state after all items removed
  useEffect(() => {
    if (!isLoading && !error && allFavorites.length === 0) {
      emptyStateRef.current?.focus();
    }
  }, [isLoading, error, allFavorites.length]);

  // Loading state
  if (isLoading && allFavorites.length === 0 && errorUpdateCount === 0) {
    return <FavoritesLoading />;
  }

  return (
    <div className="px-4 py-3 lg:px-6">
      <PageHeader
        icon={Heart}
        title="お気に入り"
        count={
          failedWithoutData
            ? undefined
            : {
                value: Math.max(0, totalCount),
                label: `${Math.max(0, totalCount)}件`,
              }
        }
        actions={
          <FavoritesToolbar
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            sortOption={sortOption}
            onSortOptionChange={setSortOption}
          />
        }
      />

      {/* Error state: 生の error.message は出さない（issue #701） */}
      {failedWithoutData && (
        <CardV2 className="mx-auto max-w-md">
          <ErrorState
            size="block"
            title="お気に入りを読み込めませんでした"
            description="時間をおいて再試行してください。"
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        </CardV2>
      )}
      {staleAfterError && (
        <ErrorState
          title="最新のお気に入りを読み込めませんでした"
          description="前回読み込んだ内容を表示しています。"
          onRetry={() => void refetch()}
          retrying={isFetching}
          className="mb-6 rounded-lg border"
        />
      )}

      {/* Empty state (no favorites at all) */}
      {failedWithoutData ? null : allFavorites.length === 0 && !isLoading ? (
        <CardV2
          ref={emptyStateRef}
          tabIndex={-1}
          className="focus:ring-primary mx-auto max-w-md focus:ring-2 focus:outline-none"
        >
          <EmptyState
            icon={Heart}
            title="お気に入り記事がありません"
            description="気になる記事のハートアイコンを押すと、ここに保存されます。"
          >
            <Button asChild className="min-h-[44px] min-w-[44px]">
              <Link href="/">記事を探す</Link>
            </Button>
          </EmptyState>
        </CardV2>
      ) : filteredFavorites.length === 0 ? (
        /* No search results */
        <CardV2 className="mx-auto max-w-md">
          <EmptyState
            icon={Search}
            title="検索結果がありません"
            description={`「${searchQuery}」に一致するお気に入りはありません。`}
          >
            <Button
              variant="outline"
              onClick={() => setSearchQuery('')}
              className="min-h-[44px] min-w-[44px]"
            >
              検索をクリア
            </Button>
          </EmptyState>
        </CardV2>
      ) : (
        /* Simple grid (no date grouping) */
        <div className="space-y-6">
          {/* Results count */}
          {searchQuery && (
            <LiveStatus
              message={`${filteredFavorites.length}件の記事が見つかりました`}
              className="text-muted-foreground text-sm"
            >
              {filteredFavorites.length}件の記事が見つかりました
            </LiveStatus>
          )}

          {/* Grid layout */}
          <section aria-label="お気に入り記事一覧">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filteredFavorites.map((article) => (
                <FavoriteArticleCard
                  key={article.id}
                  article={article}
                  onTagClick={handleTagClick}
                  onRemoveFavorite={handleRemoveFavorite}
                />
              ))}
            </div>
          </section>

          {/* Load more trigger */}
          {isFetchNextPageError ? (
            <ErrorState
              title="続きを読み込めませんでした"
              description="時間をおいて再試行してください。"
              onRetry={() => void fetchNextPage()}
              retrying={isFetchingNextPage}
              className="mt-4"
            />
          ) : (
            <InfiniteScrollTrigger
              onIntersect={fetchNextPage}
              hasNextPage={hasNextPage ?? false}
              isFetchingNextPage={isFetchingNextPage}
            />
          )}
        </div>
      )}
    </div>
  );
}
