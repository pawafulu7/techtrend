'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { FavoritesResponseSchema } from '@/lib/schemas/favorites';
import type {
  FavoriteArticle,
  FavoritesApiResponse,
} from '@/lib/types/favorites';

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

  // 注: bfcache 復元（pageshow）での再取得は行わない。
  // app/hooks/use-infinite-articles.ts と同じ判断。invalidateQueries の
  // refetchType: 'active' は読み込み済みの全ページを 1 ページ目から取り直すため、
  // /favorites に戻るたびに本 PR が直している「復帰で一覧の内容とスクロール位置が
  // 失われる」症状をそのまま再現していた。
  // 鮮度は再マウント経路で担保される（下の refetchOnMount は既定 true のまま）。
  // 受容する理由: bfcache 復元の発火経路自体が極小である。SPA 内遷移では
  // pageshow(persisted) が発火せず、BASIC 認証ゲート環境では no-store により
  // そもそも bfcache の対象外になる。

  // Shared cache update logic for favorite removal
  const updateCacheOnRemove = useCallback(
    (articleId: string) => {
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
                total:
                  index === 0
                    ? page.pagination.total - 1
                    : page.pagination.total,
                totalPages:
                  index === 0
                    ? Math.ceil(
                        (page.pagination.total - 1) / page.pagination.limit
                      )
                    : page.pagination.totalPages,
              },
            })),
          };
        }
      );
    },
    [queryClient]
  );

  // お気に入り変更イベントをリッスン（クロス画面キャッシュ同期用）
  useEffect(() => {
    const handleFavoriteChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{
        articleId: string;
        isFavorited: boolean;
      }>;
      const { articleId, isFavorited } = customEvent.detail;

      if (!isFavorited) {
        // お気に入り削除時はキャッシュから除外
        updateCacheOnRemove(articleId);
      } else {
        // お気に入り追加時は再取得（記事の全データが必要）
        queryClient.invalidateQueries({
          queryKey: ['infinite-favorites'],
          refetchType: 'active',
        });
      }
    };

    window.addEventListener('article-favorite-changed', handleFavoriteChanged);
    return () =>
      window.removeEventListener(
        'article-favorite-changed',
        handleFavoriteChanged
      );
  }, [queryClient, updateCacheOnRemove]);

  // お気に入り削除時のキャッシュ更新（外部から呼び出し可能）
  const removeFavoriteFromCache = updateCacheOnRemove;

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
        console.error(
          'Favorites API response validation failed:',
          parsed.error
        );
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
    // 未設定だと networkMode !== 'always' により既定 true になり、online イベント
    // （スリープ復帰・WiFi 再接続）で読み込み済みの全ページが 1 ページ目から
    // 取り直される。ページを蓄積する infinite query 固有の問題なので、グローバル
    // 既定ではなくここで個別に無効化する（グローバルに置くと、fetch 失敗後の
    // クエリがネットワーク復帰で自動復帰しなくなる副作用が全クエリに及ぶ）。
    refetchOnReconnect: false,
    // refetchOnMount は既定（true）のまま。お気に入り一覧はマウント時に取り直す
    // 必要がある。このフックの利用者は /favorites のみ
    // （app/favorites/_components/favorites-content.tsx）で、未マウント中に他画面で
    // 起きたお気に入りの追加・削除を上の window イベントリスナーで拾えないため、
    // false にするとキャッシュが最大 gcTime ぶん古いまま表示される。
    retry: 1,
    retryDelay: 1000,
  });

  // 全お気に入りをフラット化
  const allFavorites = useMemo<FavoriteArticle[]>(() => {
    return infiniteQuery.data?.pages.flatMap((page) => page.favorites) ?? [];
  }, [infiniteQuery.data]);

  // 総件数
  // Note: totalCountRef is used as a fallback cache for pagination total.
  // This is intentional - refs accessed in useMemo with proper dependencies are safe.
  const totalCount = useMemo<number>(() => {
    return (
      infiniteQuery.data?.pages[0]?.pagination.total ??
      // eslint-disable-next-line react-hooks/refs -- Fallback value from ref cache
      totalCountRef.current ??
      0
    );
  }, [infiniteQuery.data]);

  // eslint-disable-next-line react-hooks/refs -- totalCount uses ref as fallback cache in useMemo, not during render
  return {
    ...infiniteQuery,
    allFavorites,
    totalCount,
    removeFavoriteFromCache,
  };
}
