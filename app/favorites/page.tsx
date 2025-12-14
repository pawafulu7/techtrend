'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Heart, AlertCircle } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { InfiniteScrollTrigger } from '@/app/components/common/infinite-scroll-trigger';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  FavoriteArticleCard,
  FavoriteSkeletonGrid,
} from '@/app/components/article/favorite-card';
import { useInfiniteFavorites } from '@/app/hooks/use-infinite-favorites';
import {
  useGroupedFavorites,
  getFavoriteGroupHeadingId,
} from '@/app/hooks/use-grouped-favorites';

export default function FavoritesPage() {
  const { data: _session, status } = useSession();
  const router = useRouter();
  const emptyStateRef = useRef<HTMLDivElement>(null);

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

  // Group favorites by date
  const groupedFavorites = useGroupedFavorites(allFavorites);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login?callbackUrl=/favorites');
    }
  }, [status, router]);

  // Handle tag click
  const handleTagClick = useCallback(
    (tagName: string) => {
      router.push(`/?tags=${encodeURIComponent(tagName)}&tagMode=OR`);
    },
    [router]
  );

  // Handle favorite removal (optimistic update)
  const handleRemoveFavorite = useCallback(
    (articleId: string) => {
      removeFavoriteFromCache(articleId);
    },
    [removeFavoriteFromCache]
  );

  // Focus on empty state after all items removed
  useEffect(() => {
    if (!isLoading && allFavorites.length === 0) {
      emptyStateRef.current?.focus();
    }
  }, [isLoading, allFavorites.length]);

  // Loading state
  if (status === 'loading' || (isLoading && allFavorites.length === 0)) {
    return (
      <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4">
        {/* Header skeleton */}
        <div className="mb-6">
          <CardV2 className="p-4 sm:p-6 border-l-4 border-l-primary bg-card shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-primary/20 rounded-xl animate-pulse" />
                <div>
                  <div className="h-7 w-32 bg-muted rounded animate-pulse mb-1" />
                  <div className="h-4 w-48 bg-muted rounded animate-pulse" />
                </div>
              </div>
            </div>
          </CardV2>
        </div>
        <FavoriteSkeletonGrid />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4">
      {/* Header Card */}
      <header className="mb-6">
        <CardV2 className="p-4 sm:p-6 border-l-4 border-l-primary bg-card shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
                <Heart className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h1 className="font-heading text-xl sm:text-2xl font-bold text-foreground">
                  お気に入り
                </h1>
                <p
                  className="text-sm text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  保存した記事 ({totalCount}件)
                </p>
              </div>
            </div>
          </div>
        </CardV2>
      </header>

      {/* Error state */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            {error instanceof Error
              ? error.message
              : 'エラーが発生しました'}
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {allFavorites.length === 0 && !isLoading ? (
        <CardV2
          ref={emptyStateRef}
          tabIndex={-1}
          className="focus:outline-none focus:ring-2 focus:ring-primary max-w-md mx-auto"
        >
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <Heart
                className="h-8 w-8 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
            <p className="text-lg font-medium mb-2 text-foreground">
              お気に入り記事がありません
            </p>
            <p className="text-muted-foreground mb-6 text-center text-sm">
              気になる記事を見つけたら、ハートアイコンをクリックして保存しましょう
            </p>
            <Button asChild className="min-w-[44px] min-h-[44px]">
              <Link href="/">記事を探す</Link>
            </Button>
          </div>
        </CardV2>
      ) : (
        /* Grouped favorites grid */
        <div className="space-y-8">
          {groupedFavorites.map((group) => (
            <section
              key={group.key}
              aria-labelledby={getFavoriteGroupHeadingId(group.key)}
            >
              <h2
                id={getFavoriteGroupHeadingId(group.key)}
                className="flex items-center gap-3 mb-4"
              >
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-card border shadow-sm">
                  <span className="font-heading text-lg font-semibold text-foreground">
                    {group.label}
                  </span>
                  <span className="text-sm font-normal text-muted-foreground">
                    ({group.items.length}件)
                  </span>
                </span>
              </h2>
              {/* Grid layout matching home page */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {group.items.map((item) => (
                  <FavoriteArticleCard
                    key={item.article.id}
                    article={item.article}
                    onTagClick={handleTagClick}
                    onRemoveFavorite={handleRemoveFavorite}
                  />
                ))}
              </div>
            </section>
          ))}

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
