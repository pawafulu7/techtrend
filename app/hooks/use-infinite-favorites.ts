'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { FavoritesResponseSchema } from '@/lib/schemas/favorites';
import type { FavoriteArticle, FavoritesApiResponse } from '@/lib/types/favorites';

interface UseFavoritesOptions {
  /** 1ページあたりの件数 */
  limit?: number;
  /** 軽量モード（モバイル向け） */
  lightweight?: boolean;
  /** リレーション含む */
  includeRelations?: boolean;
}

interface FavoritesQueryData {
  pages: FavoritesApiResponse[];
  pageParams: number[];
}

/**
 * お気に入り記事の無限スクロールフック
 *
 * @param options - フェッチオプション
 * @returns React Query の useInfiniteQuery 結果
 *
 * @example
 * ```tsx
 * function FavoritesPage() {
 *   const {
 *     data,
 *     fetchNextPage,
 *     hasNextPage,
 *     isFetchingNextPage,
 *     isLoading,
 *     error,
 *   } = useInfiniteFavorites({ limit: 20 });
 *
 *   const allFavorites = data?.pages.flatMap(p => p.favorites) ?? [];
 *
 *   return (
 *     <div>
 *       {allFavorites.map(article => (
 *         <FavoriteCard key={article.id} article={article} />
 *       ))}
 *       {hasNextPage && (
 *         <button onClick={() => fetchNextPage()}>
 *           {isFetchingNextPage ? 'Loading...' : 'Load More'}
 *         </button>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useInfiniteFavorites(options: UseFavoritesOptions = {}) {
  const { limit = 20, lightweight, includeRelations = true } = options;
  const queryClient = useQueryClient();
  const totalCountRef = useRef<number | undefined>(undefined);

  // モバイル検出
  const isMobile = useMemo(
    () =>
      typeof navigator !== 'undefined' &&
      /Mobi|Android/i.test(navigator.userAgent),
    []
  );

  // bfcache復元時にキャッシュを無効化して再取得
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        queryClient.invalidateQueries({
          queryKey: ['infinite-favorites'],
          refetchType: 'active',
        });
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [queryClient]);

  // お気に入り変更イベントをリッスン（クロス画面キャッシュ同期用）
  useEffect(() => {
    const handleFavoriteChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ articleId: string; isFavorited: boolean }>;
      const { articleId, isFavorited } = customEvent.detail;

      if (!isFavorited) {
        // お気に入り削除時はキャッシュから除外
        queryClient.setQueryData<FavoritesQueryData>(
          ['infinite-favorites'],
          (oldData) => {
            if (!oldData?.pages) return oldData;

            // Check if the article exists in the cache before modifying
            const hasArticle = oldData.pages.some((page) =>
              page.favorites.some((f) => f.id === articleId)
            );
            if (!hasArticle) return oldData;

            return {
              ...oldData,
              pages: oldData.pages.map((page, index) => ({
                ...page,
                favorites: page.favorites.filter((f) => f.id !== articleId),
                pagination: {
                  ...page.pagination,
                  // Only decrement total on first page to avoid multiple decrements
                  total: index === 0 ? page.pagination.total - 1 : page.pagination.total,
                  totalPages: index === 0
                    ? Math.ceil((page.pagination.total - 1) / page.pagination.limit)
                    : page.pagination.totalPages,
                },
              })),
            };
          }
        );
      } else {
        // お気に入り追加時は再取得（記事の全データが必要）
        queryClient.invalidateQueries({
          queryKey: ['infinite-favorites'],
          refetchType: 'active',
        });
      }
    };

    window.addEventListener('article-favorite-changed', handleFavoriteChanged);
    return () => window.removeEventListener('article-favorite-changed', handleFavoriteChanged);
  }, [queryClient]);

  // お気に入り削除時のキャッシュ更新
  const removeFavoriteFromCache = useCallback(
    (articleId: string) => {
      queryClient.setQueryData<FavoritesQueryData>(
        ['infinite-favorites'],
        (oldData) => {
          if (!oldData?.pages) return oldData;

          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              favorites: page.favorites.filter((f) => f.id !== articleId),
              pagination: {
                ...page.pagination,
                total: page.pagination.total - 1,
                totalPages: Math.ceil((page.pagination.total - 1) / page.pagination.limit),
              },
            })),
          };
        }
      );
    },
    [queryClient]
  );

  const infiniteQuery = useInfiniteQuery<FavoritesApiResponse, Error>({
    queryKey: ['infinite-favorites'],
    queryFn: async ({ pageParam, signal }) => {
      const currentPage = (pageParam as number) || 1;
      const searchParams = new URLSearchParams();

      searchParams.set('page', String(currentPage));
      searchParams.set('limit', String(limit));

      // 軽量モードの設定
      if (lightweight ?? isMobile) {
        searchParams.set('lightweight', 'true');
      }

      // リレーション含む（タグ・ソース情報取得用）
      if (includeRelations) {
        searchParams.set('includeRelations', 'true');
      }

      // page > 1 の場合、前回のレスポンスから総件数を送信（COUNTクエリスキップ用）
      if (currentPage > 1 && totalCountRef.current !== undefined) {
        searchParams.set('total', String(totalCountRef.current));
      }

      const response = await fetch(
        `/api/favorites?${searchParams.toString()}`,
        { signal }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch favorites: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      // Zodスキーマでバリデーション
      const parsed = FavoritesResponseSchema.safeParse(data);
      if (!parsed.success) {
        console.error('Favorites API response validation failed:', parsed.error);
        throw new Error('お気に入りのデータ形式が不正です');
      }

      // 総件数を保存
      if (parsed.data.pagination.total !== undefined) {
        totalCountRef.current = parsed.data.pagination.total;
      }

      return parsed.data;
    },
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
    initialPageParam: 1,
    staleTime: 1000 * 60 * 5, // 5分間キャッシュ
    gcTime: 1000 * 60 * 30, // 30分間メモリに保持
    refetchOnWindowFocus: false,
    retry: 1,
    retryDelay: 1000,
  });

  // 全お気に入りをフラット化
  const allFavorites = useMemo<FavoriteArticle[]>(() => {
    return infiniteQuery.data?.pages.flatMap((page) => page.favorites) ?? [];
  }, [infiniteQuery.data]);

  // 総件数
  const totalCount = useMemo<number>(() => {
    return (
      infiniteQuery.data?.pages[0]?.pagination.total ??
      totalCountRef.current ??
      0
    );
  }, [infiniteQuery.data]);

  return {
    ...infiniteQuery,
    allFavorites,
    totalCount,
    removeFavoriteFromCache,
  };
}
