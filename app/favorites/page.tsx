'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Heart, AlertCircle, Search, ArrowUpDown } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { InfiniteScrollTrigger } from '@/app/components/common/infinite-scroll-trigger';
import { Button } from '@/components/ui/button';
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

type SortOption = 'favoritedAt-desc' | 'favoritedAt-asc' | 'publishedAt-desc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'favoritedAt-desc', label: '保存日（新しい順）' },
  { value: 'favoritedAt-asc', label: '保存日（古い順）' },
  { value: 'publishedAt-desc', label: '公開日（新しい順）' },
];

export default function FavoritesPage() {
  const { data: _session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const emptyStateRef = useRef<HTMLDivElement>(null);

  // URL params for state persistence
  const initialQuery = searchParams.get('q') || '';
  const initialSort = (searchParams.get('sort') as SortOption) || 'favoritedAt-desc';

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
    let result = [...allFavorites];

    // Search filter (title and summary)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (article) =>
          article.title.toLowerCase().includes(query) ||
          article.translatedTitle?.toLowerCase().includes(query) ||
          article.summary?.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortOption) {
        case 'favoritedAt-desc':
          return new Date(b.favoritedAt).getTime() - new Date(a.favoritedAt).getTime();
        case 'favoritedAt-asc':
          return new Date(a.favoritedAt).getTime() - new Date(b.favoritedAt).getTime();
        case 'publishedAt-desc':
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        default:
          return 0;
      }
    });

    return result;
  }, [allFavorites, searchQuery, sortOption]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (sortOption !== 'favoritedAt-desc') params.set('sort', sortOption);

    const newUrl = params.toString() ? `?${params.toString()}` : '/favorites';
    router.replace(newUrl, { scroll: false });
  }, [searchQuery, sortOption, router]);

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
        {/* Toolbar skeleton */}
        <div className="mb-6 flex flex-col sm:flex-row gap-3">
          <div className="h-11 flex-1 bg-muted rounded animate-pulse" />
          <div className="h-11 w-48 bg-muted rounded animate-pulse" />
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

      {/* Search and Sort Toolbar */}
      <div className="mb-6 p-3 bg-card border rounded-lg shadow-sm flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="タイトルや内容で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 bg-background border-2 border-input focus:border-primary"
            aria-label="お気に入り記事を検索"
          />
        </div>

        {/* Sort Select */}
        <Select
          value={sortOption}
          onValueChange={(value) => setSortOption(value as SortOption)}
        >
          <SelectTrigger
            className="w-full sm:w-52 h-11 bg-background border-2 border-input"
            aria-label="並び替え"
          >
            <ArrowUpDown className="h-4 w-4 mr-2" aria-hidden="true" />
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
      </div>

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

      {/* Empty state (no favorites at all) */}
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
      ) : filteredFavorites.length === 0 ? (
        /* No search results */
        <CardV2 className="max-w-md mx-auto">
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <Search
                className="h-8 w-8 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
            <p className="text-lg font-medium mb-2 text-foreground">
              検索結果がありません
            </p>
            <p className="text-muted-foreground mb-6 text-center text-sm">
              「{searchQuery}」に一致する記事が見つかりませんでした
            </p>
            <Button
              variant="outline"
              onClick={() => setSearchQuery('')}
              className="min-w-[44px] min-h-[44px]"
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
              className="text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {filteredFavorites.length}件の記事が見つかりました
            </p>
          )}

          {/* Grid layout */}
          <section aria-label="お気に入り記事一覧">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
