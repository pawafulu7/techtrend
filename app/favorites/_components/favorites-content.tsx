'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Heart, AlertCircle, Search, ArrowUpDown } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  FavoriteArticleCard,
  FavoriteSkeletonGrid,
} from '@/app/components/article/favorite-card';
import { useInfiniteFavorites } from '@/app/hooks/use-infinite-favorites';
import { useQueryClient } from '@tanstack/react-query';
import type { SortOption } from '../_types';

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
  } = useInfiniteFavorites({ limit: 20, includeRelations: true });

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

        if (!response.ok) {
          // Non-OK response: invalidate query to restore from server
          queryClient.invalidateQueries({ queryKey: ['infinite-favorites'] });
          return;
        }

        // Dispatch event for cross-screen cache sync
        window.dispatchEvent(
          new CustomEvent('article-favorite-changed', {
            detail: { articleId, isFavorited: false, timestamp: Date.now() },
          })
        );
      } catch {
        // Network error: invalidate query to restore from server
        queryClient.invalidateQueries({ queryKey: ['infinite-favorites'] });
      }
    },
    [removeFavoriteFromCache, queryClient]
  );

  // Focus on empty state after all items removed
  useEffect(() => {
    if (!isLoading && !error && allFavorites.length === 0) {
      emptyStateRef.current?.focus();
    }
  }, [isLoading, error, allFavorites.length]);

  // Loading state
  if (isLoading && allFavorites.length === 0) {
    return (
      <div className="px-4 py-3 lg:px-6">
        {/* Toolbar skeleton */}
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <div className="bg-muted h-5 w-5 animate-pulse rounded" />
          <div className="bg-muted h-5 w-24 animate-pulse rounded" />
          <div className="bg-muted h-4 w-12 animate-pulse rounded" />
          <div className="flex-1" />
          <div className="bg-muted h-9 w-48 animate-pulse rounded lg:w-64" />
          <div className="bg-muted h-9 w-44 animate-pulse rounded" />
        </div>
        <FavoriteSkeletonGrid />
      </div>
    );
  }

  return (
    <div className="px-4 py-3 lg:px-6">
      {/* Toolbar: Title + Count + Search + Sort */}
      <header className="flex flex-wrap items-center gap-2 pb-3">
        <Heart className="text-primary h-5 w-5" aria-hidden="true" />
        <h1 className="text-foreground text-lg font-semibold">お気に入り</h1>
        <span
          className="text-muted-foreground text-sm"
          role="status"
          aria-live="polite"
        >
          ({Math.max(0, totalCount)}件)
        </span>
        <div className="flex-1" />
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
      </header>

      {/* Error state */}
      {error && (
        <Alert
          variant="destructive"
          className="mb-6"
          data-testid="error-message"
        >
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            {error instanceof Error ? error.message : 'エラーが発生しました'}
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state (no favorites at all) */}
      {allFavorites.length === 0 && !isLoading ? (
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
          <InfiniteScrollTrigger
            onIntersect={fetchNextPage}
            hasNextPage={hasNextPage ?? false}
            isFetchingNextPage={isFetchingNextPage}
          />
        </div>
      )}
    </div>
  );
}
