'use client';

import { useEffect, useCallback, useMemo, useRef } from 'react';
import { authClient } from '@/lib/auth/auth-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const STORAGE_KEY_PREFIX = 'techtrend-read-articles';
const READ_STATUS_QUERY_KEY = ['read-status'] as const;

interface ReadStatusResponse {
  readArticleIds: string[];
  unreadCount: number;
}

interface ReadStatusCache {
  readArticleIds: Set<string>;
  unreadCount: number;
}

function getStorageKey(storageUserId: string): string {
  return `${STORAGE_KEY_PREFIX}:${storageUserId}`;
}

// localStorage との同期ユーティリティ
function saveToLocalStorage(ids: Set<string>, storageUserId?: string) {
  if (!storageUserId) return;
  try {
    localStorage.setItem(
      getStorageKey(storageUserId),
      JSON.stringify(Array.from(ids))
    );
  } catch (error) {
    console.error('Error saving read status to localStorage:', error);
  }
}

/**
 * 旧ストレージキー ('techtrend-read-articles') から新ゲストキーへの一回限りのマイグレーション。
 * 新キーにデータが存在しない場合のみ実行し、マイグレーション後は旧キーを削除する。
 */
function migrateGuestStorageKey() {
  if (typeof window === 'undefined') return;
  const OLD_KEY = STORAGE_KEY_PREFIX;
  const newKey = getStorageKey('guest');
  try {
    // 新キーに既にデータがある場合はスキップ
    if (localStorage.getItem(newKey) !== null) return;
    const oldData = localStorage.getItem(OLD_KEY);
    if (oldData !== null) {
      localStorage.setItem(newKey, oldData);
      localStorage.removeItem(OLD_KEY);
    }
  } catch (error) {
    console.error('Error migrating guest read status storage key:', error);
  }
}

function loadFromLocalStorage(storageUserId?: string): Set<string> {
  if (!storageUserId || typeof window === 'undefined') return new Set<string>();
  try {
    const stored = localStorage.getItem(getStorageKey(storageUserId));
    if (stored) {
      return new Set<string>(JSON.parse(stored));
    }
  } catch (error) {
    console.error('Error loading read status from localStorage:', error);
  }
  return new Set<string>();
}

export function useReadStatus(articleIds?: string[]) {
  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user?.id;
  const storageUserId = isPending ? undefined : (userId ?? 'guest');
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => {
    const normalizedArticleIds = articleIds ? [...articleIds].sort() : [];
    const articleIdsKey = normalizedArticleIds.length
      ? normalizedArticleIds.join(',')
      : 'all';
    return [
      ...READ_STATUS_QUERY_KEY,
      {
        articleIds: articleIdsKey,
        userId: storageUserId,
      },
    ] as const;
  }, [articleIds, storageUserId]);

  // 既読状態を取得
  const {
    data: readStatusData,
    isLoading,
    refetch,
  } = useQuery<ReadStatusCache>({
    queryKey,
    queryFn: async ({ signal }) => {
      if (!session?.user) {
        return {
          readArticleIds: loadFromLocalStorage(storageUserId),
          unreadCount: 0,
        };
      }
      const params = articleIds?.length
        ? `?articleIds=${articleIds.join(',')}`
        : '';
      const response = await fetch(`/api/articles/read-status${params}`, {
        signal,
      });
      if (!response.ok) {
        throw new Error('Failed to fetch read status');
      }
      const data: ReadStatusResponse = await response.json();
      const newReadArticleIds = new Set<string>(data.readArticleIds);
      saveToLocalStorage(newReadArticleIds, storageUserId);
      return {
        readArticleIds: newReadArticleIds,
        unreadCount: data.unreadCount ?? 0,
      };
    },
    enabled: !isPending,
    // localStorageから初期値を設定（ゲスト時は旧キーからマイグレーション）
    initialData: () => {
      if (!userId) {
        migrateGuestStorageKey();
      }
      return {
        readArticleIds: loadFromLocalStorage(storageUserId),
        unreadCount: 0,
      };
    },
    refetchOnMount: 'always',
  });

  const readArticleIds = useMemo(
    () => readStatusData?.readArticleIds ?? new Set<string>(),
    [readStatusData]
  );
  const unreadCount = readStatusData?.unreadCount ?? 0;

  // bfcache復元時にサーバーの最新状態を再取得
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // bfcacheから復元された場合、localStorageを再読み込みしてからサーバー再取得
        const stored = loadFromLocalStorage(storageUserId);
        queryClient.setQueryData(
          queryKey,
          (old: ReadStatusCache | undefined) => ({
            readArticleIds: stored,
            unreadCount: old?.unreadCount ?? 0,
          })
        );
        refetch();
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [refetch, queryClient, queryKey, storageUserId]);

  // ReadTrackerからのカスタムイベントをリッスン
  useEffect(() => {
    const handleReadStatusChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{
        articleId: string;
        isRead: boolean;
      }>;
      const { articleId, isRead: newIsRead } = customEvent.detail;

      queryClient.setQueryData(queryKey, (old: ReadStatusCache | undefined) => {
        if (!old) return old;
        const newSet = new Set(old.readArticleIds);
        if (newIsRead) {
          if (newSet.has(articleId)) return old;
          newSet.add(articleId);
          saveToLocalStorage(newSet, storageUserId);
          return {
            readArticleIds: newSet,
            unreadCount: Math.max(0, old.unreadCount - 1),
          };
        } else {
          if (!newSet.has(articleId)) return old;
          newSet.delete(articleId);
          saveToLocalStorage(newSet, storageUserId);
          return {
            readArticleIds: newSet,
            unreadCount: old.unreadCount + 1,
          };
        }
      });
    };

    window.addEventListener(
      'article-read-status-changed',
      handleReadStatusChanged
    );
    return () =>
      window.removeEventListener(
        'article-read-status-changed',
        handleReadStatusChanged
      );
  }, [queryClient, queryKey, storageUserId]);

  const bulkReadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // アンマウント時にpending setTimeout をクリア
  useEffect(() => {
    return () => {
      if (bulkReadTimeoutRef.current !== null) {
        clearTimeout(bulkReadTimeoutRef.current);
      }
    };
  }, []);

  type MutationContext = { previous: ReadStatusCache | undefined };

  // 記事を既読にマーク
  const markAsReadMutation = useMutation<void, Error, string, MutationContext>({
    mutationFn: async (articleId) => {
      if (!session?.user) return;
      const response = await fetch('/api/articles/read-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId }),
      });
      if (!response.ok) {
        throw new Error('Failed to mark as read');
      }
    },
    onMutate: async (articleId) => {
      // 楽観的更新
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ReadStatusCache>(queryKey);
      queryClient.setQueryData(queryKey, (old: ReadStatusCache | undefined) => {
        if (!old) return old;
        if (old.readArticleIds.has(articleId)) return old;
        const newSet = new Set([...old.readArticleIds, articleId]);
        saveToLocalStorage(newSet, storageUserId);
        return {
          readArticleIds: newSet,
          unreadCount: Math.max(0, old.unreadCount - 1),
        };
      });
      return { previous };
    },
    onError: (_err, _articleId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
        saveToLocalStorage(context.previous.readArticleIds, storageUserId);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // 記事を未読に戻す
  const markAsUnreadMutation = useMutation<
    void,
    Error,
    string,
    MutationContext
  >({
    mutationFn: async (articleId) => {
      if (!session?.user) return;
      const response = await fetch(
        `/api/articles/read-status?articleId=${articleId}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        throw new Error('Failed to mark as unread');
      }
    },
    onMutate: async (articleId) => {
      // 楽観的更新
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ReadStatusCache>(queryKey);
      queryClient.setQueryData(queryKey, (old: ReadStatusCache | undefined) => {
        if (!old) return old;
        if (!old.readArticleIds.has(articleId)) return old;
        const newSet = new Set(old.readArticleIds);
        newSet.delete(articleId);
        saveToLocalStorage(newSet, storageUserId);
        return {
          readArticleIds: newSet,
          unreadCount: old.unreadCount + 1,
        };
      });
      return { previous };
    },
    onError: (_err, _articleId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
        saveToLocalStorage(context.previous.readArticleIds, storageUserId);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // 全未読記事を一括既読にマーク
  const markAllAsReadMutation = useMutation<
    { markedCount?: number } | void,
    Error,
    void,
    MutationContext
  >({
    mutationFn: async () => {
      if (!session?.user) return;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);
      try {
        const response = await fetch('/api/articles/read-status', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          throw new Error('Failed to mark all as read');
        }
        return response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Request timeout after 5 minutes');
        }
        throw error;
      }
    },
    onMutate: async () => {
      // 楽観的更新: 未読数を0に、readArticleIdsをarticleIdsの全件で更新
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ReadStatusCache>(queryKey);
      queryClient.setQueryData(queryKey, (old: ReadStatusCache | undefined) => {
        if (!old) return old;
        const newReadArticleIds = articleIds?.length
          ? new Set([...old.readArticleIds, ...articleIds])
          : old.readArticleIds;
        saveToLocalStorage(newReadArticleIds, storageUserId);
        return { readArticleIds: newReadArticleIds, unreadCount: 0 };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
        saveToLocalStorage(context.previous.readArticleIds, storageUserId);
      }
      console.error('Error marking all as read:', _err.message);
    },
    onSuccess: () => {
      // 記事リストを再取得するためのカスタムイベントを発火
      if (bulkReadTimeoutRef.current !== null) {
        clearTimeout(bulkReadTimeoutRef.current);
      }
      bulkReadTimeoutRef.current = setTimeout(() => {
        bulkReadTimeoutRef.current = null;
        window.dispatchEvent(
          new CustomEvent('articles-bulk-read', {
            detail: { isRead: true },
          })
        );
      }, 100);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // 記事が既読かどうか
  const isRead = useCallback(
    (articleId: string) => readArticleIds.has(articleId),
    [readArticleIds]
  );

  // markAsRead / markAsUnread は async 関数として公開（既存APIとの互換性維持）
  const markAsRead = useCallback(
    async (articleId: string) => {
      if (!session?.user) return;
      await markAsReadMutation.mutateAsync(articleId);
    },
    [session, markAsReadMutation]
  );

  const markAsUnread = useCallback(
    async (articleId: string) => {
      if (!session?.user) return;
      await markAsUnreadMutation.mutateAsync(articleId);
    },
    [session, markAsUnreadMutation]
  );

  const markAllAsRead = useCallback(async () => {
    if (!session?.user) return;
    return markAllAsReadMutation.mutateAsync();
  }, [session, markAllAsReadMutation]);

  return {
    readArticleIds,
    unreadCount,
    isRead,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    isLoading,
    refetch,
  };
}
