'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Heart, Search, ArrowUpDown } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { PageHeader } from '@/components/ui-v2/page-header';
import { InfiniteScrollTrigger } from '@/app/components/common/infinite-scroll-trigger';
import { Button } from '@/components/ui-v2/button-v2';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FavoriteArticleCard,
  FavoriteSkeletonGrid,
} from '@/app/components/article/favorite-card';
import { useInfiniteFavorites } from '@/app/hooks/use-infinite-favorites';
import { useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth/auth-client';
import type { SortOption } from '../_types';
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

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'favoritedAt-desc', label: '保存日（新しい順）' },
  { value: 'favoritedAt-asc', label: '保存日（古い順）' },
  { value: 'publishedAt-desc', label: '公開日（新しい順）' },
];

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
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-3">
        {/* 見出しは読み込み中も出す（h1 を常に1つ置く。Issue #700） */}
        <PageHeader
          icon={Heart}
          title="お気に入り"
          actions={
            <>
              <div className="bg-muted h-9 w-48 animate-pulse rounded lg:w-64" />
              <div className="bg-muted h-9 w-44 animate-pulse rounded" />
            </>
          }
        />
        <FavoriteSkeletonGrid />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-3">
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
          <>
            <div className="relative">
              <Search
                className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                type="search"
                placeholder="検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-48 pl-10 lg:w-64"
                aria-label="お気に入り記事を検索"
              />
            </div>
            <Select
              value={sortOption}
              onValueChange={(value) => {
                if (SORT_OPTIONS.some((o) => o.value === value)) {
                  setSortOption(value as SortOption);
                }
              }}
            >
              <SelectTrigger className="h-9 w-44" aria-label="並び替え">
                <ArrowUpDown className="mr-2 h-4 w-4" aria-hidden="true" />
                <SelectValue placeholder="並び替え" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
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
          <div
            data-testid="empty-state"
            className="flex flex-col items-center justify-center px-4 py-12"
            role="status"
            aria-live="polite"
          >
            <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <Heart
                className="text-muted-foreground h-8 w-8"
                aria-hidden="true"
              />
            </div>
            <p className="text-foreground mb-2 text-lg font-medium">
              お気に入り記事がありません
            </p>
            <p className="text-muted-foreground mb-6 text-center text-sm">
              気になる記事を見つけたら、ハートアイコンをクリックして保存しましょう
            </p>
            <Button asChild className="min-h-[44px] min-w-[44px]">
              <Link href="/">記事を探す</Link>
            </Button>
          </div>
        </CardV2>
      ) : filteredFavorites.length === 0 ? (
        /* No search results */
        <CardV2 className="mx-auto max-w-md">
          <div className="flex flex-col items-center justify-center px-4 py-12">
            <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <Search
                className="text-muted-foreground h-8 w-8"
                aria-hidden="true"
              />
            </div>
            <p className="text-foreground mb-2 text-lg font-medium">
              検索結果がありません
            </p>
            <p className="text-muted-foreground mb-6 text-center text-sm">
              「{searchQuery}」に一致する記事が見つかりませんでした
            </p>
            <Button
              variant="outline"
              onClick={() => setSearchQuery('')}
              className="min-h-[44px] min-w-[44px]"
            >
              検索をクリア
            </Button>
          </div>
        </CardV2>
      ) : (
        /* Simple grid (no date grouping) */
        <div className="space-y-6">
          {/* Results count */}
          {searchQuery && (
            <p
              className="text-muted-foreground text-sm"
              role="status"
              aria-live="polite"
            >
              {filteredFavorites.length}件の記事が見つかりました
            </p>
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
