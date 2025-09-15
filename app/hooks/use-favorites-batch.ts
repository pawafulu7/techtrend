import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useCallback, useMemo } from 'react';

interface FavoritesMap {
  [articleId: string]: boolean;
}

interface FavoritesResponse {
  favorites: FavoritesMap;
}

/**
 * 複数記事のお気に入り状態を一括取得・管理するHook
 */
export function useFavoritesBatch(articleIds: string[]) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  // 記事IDをソートして安定したクエリキーを生成
  const sortedArticleIds = useMemo(() => {
    return [...articleIds].sort();
  }, [articleIds]);

  // お気に入り状態を一括取得
  const { data, isLoading, error } = useQuery<FavoritesResponse>({
    queryKey: ['favorites-batch', sortedArticleIds, session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id || articleIds.length === 0) {
        return { favorites: {} };
      }

      const response = await fetch('/api/favorites/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ articleIds }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch favorites');
      }

      return response.json();
    },
    enabled: !!session?.user?.id && articleIds.length > 0,
    staleTime: 1000 * 60 * 5, // 5分間キャッシュ
    gcTime: 1000 * 60 * 10, // 10分間メモリに保持
  });

  // お気に入り追加ミューテーション
  const addFavorite = useMutation({
    mutationFn: async (articleId: string) => {
      const response = await fetch('/api/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ articleId }),
      });

      if (!response.ok) {
        throw new Error('Failed to add favorite');
      }

      return response.json();
    },
    onMutate: async (articleId) => {
      // Optimistic Update
      await queryClient.cancelQueries({
        queryKey: ['favorites-batch', sortedArticleIds, session?.user?.id]
      });

      const previousData = queryClient.getQueryData<FavoritesResponse>([
        'favorites-batch',
        sortedArticleIds,
        session?.user?.id,
      ]);

      queryClient.setQueryData<FavoritesResponse>(
        ['favorites-batch', sortedArticleIds, session?.user?.id],
        (old) => ({
          favorites: {
            ...old?.favorites,
            [articleId]: true,
          },
        })
      );

      return { previousData };
    },
    onError: (_, __, context) => {
      // エラー時はロールバック
      if (context?.previousData) {
        queryClient.setQueryData(
          ['favorites-batch', sortedArticleIds, session?.user?.id],
          context.previousData
        );
      }
    },
    onSettled: () => {
      // 最新データを再取得
      queryClient.invalidateQueries({
        queryKey: ['favorites-batch']
      });
    },
  });

  // お気に入り削除ミューテーション
  const removeFavorite = useMutation({
    mutationFn: async (articleId: string) => {
      const response = await fetch(`/api/favorites?articleId=${articleId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to remove favorite');
      }

      return response.json();
    },
    onMutate: async (articleId) => {
      // Optimistic Update
      await queryClient.cancelQueries({
        queryKey: ['favorites-batch', sortedArticleIds, session?.user?.id]
      });

      const previousData = queryClient.getQueryData<FavoritesResponse>([
        'favorites-batch',
        sortedArticleIds,
        session?.user?.id,
      ]);

      queryClient.setQueryData<FavoritesResponse>(
        ['favorites-batch', sortedArticleIds, session?.user?.id],
        (old) => ({
          favorites: {
            ...old?.favorites,
            [articleId]: false,
          },
        })
      );

      return { previousData };
    },
    onError: (_, __, context) => {
      // エラー時はロールバック
      if (context?.previousData) {
        queryClient.setQueryData(
          ['favorites-batch', sortedArticleIds, session?.user?.id],
          context.previousData
        );
      }
    },
    onSettled: () => {
      // 最新データを再取得
      queryClient.invalidateQueries({
        queryKey: ['favorites-batch']
      });
    },
  });

  // お気に入り状態のトグル
  const toggleFavorite = useCallback(
    (articleId: string) => {
      const isFavorited = data?.favorites[articleId] || false;

      if (isFavorited) {
        removeFavorite.mutate(articleId);
      } else {
        addFavorite.mutate(articleId);
      }
    },
    [data?.favorites, addFavorite, removeFavorite]
  );

  // 特定記事のお気に入り状態を取得
  const isFavorited = useCallback(
    (articleId: string) => {
      return data?.favorites[articleId] || false;
    },
    [data?.favorites]
  );

  return {
    favorites: data?.favorites || {},
    isLoading,
    error,
    toggleFavorite,
    isFavorited,
    addFavorite: addFavorite.mutate,
    removeFavorite: removeFavorite.mutate,
    isToggling: addFavorite.isPending || removeFavorite.isPending,
  };
}

/**
 * 単一記事のお気に入り状態を管理するHook（バッチAPIを利用）
 */
export function useFavorite(articleId: string, enabled: boolean = true) {
  // enabledがfalseの場合は空の配列を渡してAPIコールを抑制
  const batch = useFavoritesBatch(enabled ? [articleId] : []);

  return {
    isFavorited: enabled ? batch.isFavorited(articleId) : false,
    isLoading: enabled ? batch.isLoading : false,
    toggleFavorite: enabled ? () => batch.toggleFavorite(articleId) : () => {},
    isToggling: enabled ? batch.isToggling : false,
  };
}