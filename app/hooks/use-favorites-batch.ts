import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useCallback, useMemo, useRef, useEffect } from 'react';

interface FavoritesMap {
  [articleId: string]: boolean;
}

interface FavoritesResponse {
  favorites: FavoritesMap;
}

// グローバルなキャッシュストア（メモリ内）
const globalFavoritesCache = new Map<string, boolean>();

/**
 * 複数記事のお気に入り状態を一括取得・管理するHook
 * 効率的にキャッシュを活用し、新規記事のみAPIコールを行う
 */
export function useFavoritesBatch(articleIds: string[]) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const prevArticleIdsRef = useRef<string[]>([]);

  // お気に入り状態を取得（初回のみ、または手動リフレッシュ時）
  const { data, isLoading, error, refetch } = useQuery<FavoritesResponse>({
    queryKey: ['favorites-batch', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) {
        return { favorites: {} };
      }

      // 前回取得した記事IDとの差分を計算
      const prevIds = new Set(prevArticleIdsRef.current);
      const currentIds = new Set(articleIds);

      // 新規に追加された記事IDのみを抽出
      const newIds = articleIds.filter(id => !prevIds.has(id) && !globalFavoritesCache.has(`${session.user.id}:${id}`));

      // 新規記事がない場合は、既存のキャッシュから結果を構築
      if (newIds.length === 0) {
        const result: FavoritesMap = {};
        for (const id of articleIds) {
          const cacheKey = `${session.user.id}:${id}`;
          result[id] = globalFavoritesCache.get(cacheKey) || false;
        }
        return { favorites: result };
      }

      // 新規記事のみAPIコール（100件ずつに分割）
      const BATCH_SIZE = 100;
      const batches: string[][] = [];

      for (let i = 0; i < newIds.length; i += BATCH_SIZE) {
        batches.push(newIds.slice(i, i + BATCH_SIZE));
      }

      // 各バッチを並列実行
      const responses = await Promise.all(
        batches.map(async (batch) => {
          const response = await fetch('/api/favorites/batch', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ articleIds: batch }),
          });

          if (!response.ok) {
            throw new Error('Failed to fetch favorites');
          }

          return response.json();
        })
      );

      // 新規取得分をグローバルキャッシュに保存
      const userId = session.user.id;
      for (const response of responses) {
        for (const [articleId, isFavorited] of Object.entries(response.favorites)) {
          globalFavoritesCache.set(`${userId}:${articleId}`, isFavorited as boolean);
        }
      }

      // 現在要求されているIDの結果を構築
      const result: FavoritesMap = {};
      for (const id of articleIds) {
        const cacheKey = `${userId}:${id}`;
        result[id] = globalFavoritesCache.get(cacheKey) || false;
      }

      // 現在の記事IDリストを保存
      prevArticleIdsRef.current = articleIds;

      return { favorites: result };
    },
    enabled: !!session?.user?.id,
    staleTime: 1000 * 60 * 5, // 5分間キャッシュ
    gcTime: 1000 * 60 * 10, // 10分間メモリに保持
    // 記事IDが変わっても自動的に再フェッチしない
    structuralSharing: false,
  });

  // 記事IDが変更されたときに、新規分のみ取得
  useEffect(() => {
    if (!session?.user?.id || articleIds.length === 0) return;

    const prevIds = new Set(prevArticleIdsRef.current);
    const newIds = articleIds.filter(id => !prevIds.has(id));

    // 新規記事がある場合のみ再フェッチ
    if (newIds.length > 0) {
      // 既存のキャッシュデータがある場合は、新規分のみ取得
      const userId = session.user.id;
      const uncachedIds = newIds.filter(id => !globalFavoritesCache.has(`${userId}:${id}`));

      if (uncachedIds.length > 0) {
        refetch();
      }
    }
  }, [articleIds, session?.user?.id, refetch]);

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
        queryKey: ['favorites-batch', session?.user?.id]
      });

      // グローバルキャッシュを更新
      if (session?.user?.id) {
        globalFavoritesCache.set(`${session.user.id}:${articleId}`, true);
      }

      const previousData = queryClient.getQueryData<FavoritesResponse>([
        'favorites-batch',
        session?.user?.id,
      ]);

      queryClient.setQueryData<FavoritesResponse>(
        ['favorites-batch', session?.user?.id],
        (old) => ({
          favorites: {
            ...old?.favorites,
            [articleId]: true,
          },
        })
      );

      return { previousData, articleId };
    },
    onError: (_, articleId, context) => {
      // エラー時はロールバック
      if (session?.user?.id) {
        globalFavoritesCache.set(`${session.user.id}:${articleId}`, false);
      }
      if (context?.previousData) {
        queryClient.setQueryData(
          ['favorites-batch', session?.user?.id],
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
        queryKey: ['favorites-batch', session?.user?.id]
      });

      // グローバルキャッシュを更新
      if (session?.user?.id) {
        globalFavoritesCache.set(`${session.user.id}:${articleId}`, false);
      }

      const previousData = queryClient.getQueryData<FavoritesResponse>([
        'favorites-batch',
        session?.user?.id,
      ]);

      queryClient.setQueryData<FavoritesResponse>(
        ['favorites-batch', session?.user?.id],
        (old) => ({
          favorites: {
            ...old?.favorites,
            [articleId]: false,
          },
        })
      );

      return { previousData, articleId };
    },
    onError: (_, articleId, context) => {
      // エラー時はロールバック
      if (session?.user?.id) {
        globalFavoritesCache.set(`${session.user.id}:${articleId}`, true);
      }
      if (context?.previousData) {
        queryClient.setQueryData(
          ['favorites-batch', session?.user?.id],
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