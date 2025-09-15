import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useCallback, useMemo, useRef, useEffect, useState } from 'react';

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
  const [favorites, setFavorites] = useState<FavoritesMap>({});
  const [isLoading, setIsLoading] = useState(false);
  const fetchingRef = useRef<Set<string>>(new Set());

  // 新規記事のお気に入り状態を取得
  const fetchNewFavorites = useCallback(async (newIds: string[]) => {
    if (!session?.user?.id || newIds.length === 0) return;

    const userId = session.user.id;

    // すでにフェッチ中のIDは除外
    const idsToFetch = newIds.filter(id => !fetchingRef.current.has(id));
    if (idsToFetch.length === 0) return;

    // フェッチ中フラグを立てる
    idsToFetch.forEach(id => fetchingRef.current.add(id));

    try {
      setIsLoading(true);

      // 100件ずつに分割
      const BATCH_SIZE = 100;
      const batches: string[][] = [];
      for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
        batches.push(idsToFetch.slice(i, i + BATCH_SIZE));
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

      // グローバルキャッシュとステートを更新
      const newFavorites: FavoritesMap = {};
      for (const response of responses) {
        for (const [articleId, isFavorited] of Object.entries(response.favorites)) {
          const cacheKey = `${userId}:${articleId}`;
          globalFavoritesCache.set(cacheKey, isFavorited as boolean);
          newFavorites[articleId] = isFavorited as boolean;
        }
      }

      setFavorites(prev => ({ ...prev, ...newFavorites }));
    } finally {
      setIsLoading(false);
      // フェッチ中フラグをクリア
      idsToFetch.forEach(id => fetchingRef.current.delete(id));
    }
  }, [session?.user?.id]);

  // 記事IDが変更されたときに、新規記事のみフェッチ
  useEffect(() => {
    if (!session?.user?.id || articleIds.length === 0) return;

    const userId = session.user.id;
    const newIds: string[] = [];
    const cachedFavorites: FavoritesMap = {};

    // キャッシュ済みとフェッチが必要なIDを分離
    for (const id of articleIds) {
      const cacheKey = `${userId}:${id}`;
      if (globalFavoritesCache.has(cacheKey)) {
        cachedFavorites[id] = globalFavoritesCache.get(cacheKey) || false;
      } else {
        newIds.push(id);
      }
    }

    // キャッシュ済みのデータを即座に反映
    if (Object.keys(cachedFavorites).length > 0) {
      setFavorites(prev => ({ ...prev, ...cachedFavorites }));
    }

    // 新規記事があればフェッチ
    if (newIds.length > 0) {
      console.log(`[Favorites] Fetching ${newIds.length} new articles`);
      fetchNewFavorites(newIds);
    } else {
      console.log(`[Favorites] All ${articleIds.length} articles are cached`);
    }
  }, [articleIds, session?.user?.id, fetchNewFavorites]);

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
      if (session?.user?.id) {
        const cacheKey = `${session.user.id}:${articleId}`;
        globalFavoritesCache.set(cacheKey, true);
        setFavorites(prev => ({ ...prev, [articleId]: true }));
      }

      return { articleId };
    },
    onError: (_, articleId) => {
      // エラー時はロールバック
      if (session?.user?.id) {
        const cacheKey = `${session.user.id}:${articleId}`;
        globalFavoritesCache.set(cacheKey, false);
        setFavorites(prev => ({ ...prev, [articleId]: false }));
      }
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
      if (session?.user?.id) {
        const cacheKey = `${session.user.id}:${articleId}`;
        globalFavoritesCache.set(cacheKey, false);
        setFavorites(prev => ({ ...prev, [articleId]: false }));
      }

      return { articleId };
    },
    onError: (_, articleId) => {
      // エラー時はロールバック
      if (session?.user?.id) {
        const cacheKey = `${session.user.id}:${articleId}`;
        globalFavoritesCache.set(cacheKey, true);
        setFavorites(prev => ({ ...prev, [articleId]: true }));
      }
    },
  });

  // お気に入り状態のトグル
  const toggleFavorite = useCallback(
    (articleId: string) => {
      const isFavorited = favorites[articleId] || false;

      if (isFavorited) {
        removeFavorite.mutate(articleId);
      } else {
        addFavorite.mutate(articleId);
      }
    },
    [favorites, addFavorite, removeFavorite]
  );

  // 特定記事のお気に入り状態を取得
  const isFavorited = useCallback(
    (articleId: string) => {
      return favorites[articleId] || false;
    },
    [favorites]
  );

  return {
    favorites,
    isLoading,
    error: null,
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