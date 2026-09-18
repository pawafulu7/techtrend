'use client';

import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { authClient } from '@/lib/auth/auth-client';
import { useIsSessionPendingLatched } from '@/lib/auth/use-session-resolved';
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
 * 既存の localStorage データにマージしてから保存するヘルパー。
 * 部分的な Set で上書きして他ページの既読データを失う問題を防ぐ。
 */
function updateStoredReadIds(
  storageUserId: string | undefined,
  updater: (current: Set<string>) => Set<string>
): Set<string> {
  if (!storageUserId) return new Set<string>();
  const next = updater(loadFromLocalStorage(storageUserId));
  saveToLocalStorage(next, storageUserId);
  return next;
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

  // better-auth のセッション取得は初回解決後にも isPending を true へ戻しうる
  // （タブ復帰時の再検証など）。その揺れをそのまま enabled に流すと false→true の
  // 再遷移で TanStack Query の shouldFetchOptionally 経路が走り、タブ復帰ごとに
  // 既読状態が再取得される。そこで「一度 false になったら以降 false 固定」の
  // ラッチを掛ける。
  // ラッチはモジュールスコープの共有状態（lib/auth/use-session-resolved.ts）で、
  // lib/hooks/use-personalization-preferences.ts と同じ実体を使う。インスタンス
  // 単位だと記事詳細 → ホームのような再マウント経路でラッチが効かない。
  const isSessionPendingLatched = useIsSessionPendingLatched();

  // storageUserId は localStorage のバケット選択に使うと同時に、undefined が
  // 「identity 未確定」を表す意図的な sentinel になっている（saveToLocalStorage /
  // updateStoredReadIds の早期 return の根拠）。単純に `userId ?? 'guest'` には
  // できない: ログイン済みユーザーの identity 未確定な窓で mutation が起きると
  // 既読が guest バケットへ書かれてしまう（identity 汚染）。
  // そのため last-known-value ラッチで 3 分岐にする。
  //   ① identity が一度も確定していない → undefined 据え置き（sentinel 維持＝書き込み抑止）
  //   ② isPending による一時的な不明期間 → 直前に確定した値を保持（queryKey を揺らさない）
  //   ③ 実際の identity 変化（guest→user、A→B） → 即時反映
  const resolvedStorageUserId = isPending ? undefined : (userId ?? 'guest');
  const [lastResolvedStorageUserId, setLastResolvedStorageUserId] = useState<
    string | undefined
  >(undefined);
  if (
    resolvedStorageUserId !== undefined &&
    resolvedStorageUserId !== lastResolvedStorageUserId
  ) {
    setLastResolvedStorageUserId(resolvedStorageUserId);
  }
  // ③ は resolvedStorageUserId を優先するため同一 render 内で即時反映される
  const storageUserId = resolvedStorageUserId ?? lastResolvedStorageUserId;

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
      const fetchedIds = new Set<string>(data.readArticleIds);
      // articleIds 指定時（部分取得）は既存の localStorage データにマージして上書き損失を防ぐ
      // 全件取得時は取得結果で完全置換する
      const mergedIds = articleIds?.length
        ? updateStoredReadIds(storageUserId, (current) => {
            const next = new Set(current);
            // Remove all IDs in the queried scope, then add back what server returned
            for (const id of articleIds!) next.delete(id);
            for (const id of fetchedIds) next.add(id);
            return next;
          })
        : (() => {
            saveToLocalStorage(fetchedIds, storageUserId);
            return fetchedIds;
          })();
      return {
        readArticleIds: mergedIds,
        unreadCount: data.unreadCount ?? 0,
      };
    },
    enabled: !isSessionPendingLatched,
    // localStorageから初期値を設定（ゲスト時は旧キーからマイグレーション）
    initialData: () => {
      // identity 未確定（storageUserId が sentinel の undefined）の間は
      // どのバケットも読まない。isPending ではなく sentinel で判定するのは、
      // 一時的な isPending 中は storageUserId が確定値にラッチされており
      // そのバケットを読んで良いため
      if (storageUserId === undefined) {
        return { readArticleIds: new Set<string>(), unreadCount: 0 };
      }
      if (storageUserId === 'guest') {
        migrateGuestStorageKey();
      }
      return {
        readArticleIds: loadFromLocalStorage(storageUserId),
        unreadCount: 0,
      };
    },
    // 【削除・変更禁止】initialData を渡すと query-core は dataUpdatedAt を
    // `hasData ? initialDataUpdatedAt ?? Date.now() : 0` で決めるため、未指定だと
    // 「現在時刻」扱いになり staleTime: 5分 の下で常に fresh 判定になる。
    // その状態では refetchOnMount: 'always'（isStale 判定を飛ばす唯一の経路）を
    // 外した瞬間にこのクエリがサーバーへ到達しなくなり、unreadCount が initialData の
    // 0 で固定される＝一括既読ボタンが常時 disabled・未読バッジも出なくなる。
    // 0 は nullish ではないのでそのまま保持され、「初期値は既に stale」を意味する。
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60 * 1000, // 5分（グローバル既定と同値。意図を明示して固定する）
    refetchOnMount: true,
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
        if (newIsRead) {
          if (old.readArticleIds.has(articleId)) return old;
          const newSet = updateStoredReadIds(storageUserId, (current) => {
            const next = new Set(current);
            next.add(articleId);
            return next;
          });
          return {
            readArticleIds: newSet,
            unreadCount: Math.max(0, old.unreadCount - 1),
          };
        } else {
          if (!old.readArticleIds.has(articleId)) return old;
          const newSet = updateStoredReadIds(storageUserId, (current) => {
            const next = new Set(current);
            next.delete(articleId);
            return next;
          });
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

  type MutationContext = {
    previous: ReadStatusCache | undefined;
    previousStoredIds: Set<string>;
    capturedStorageUserId: string | undefined;
  };

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
      const previousStoredIds = loadFromLocalStorage(storageUserId);
      const capturedStorageUserId = storageUserId;
      queryClient.setQueryData(queryKey, (old: ReadStatusCache | undefined) => {
        if (!old) return old;
        if (old.readArticleIds.has(articleId)) return old;
        const newSet = updateStoredReadIds(storageUserId, (current) => {
          const next = new Set(current);
          next.add(articleId);
          return next;
        });
        return {
          readArticleIds: newSet,
          unreadCount: Math.max(0, old.unreadCount - 1),
        };
      });
      return { previous, previousStoredIds, capturedStorageUserId };
    },
    onError: (_err, _articleId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      if (context?.previousStoredIds) {
        saveToLocalStorage(
          context.previousStoredIds,
          context.capturedStorageUserId
        );
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
      const previousStoredIds = loadFromLocalStorage(storageUserId);
      const capturedStorageUserId = storageUserId;
      queryClient.setQueryData(queryKey, (old: ReadStatusCache | undefined) => {
        if (!old) return old;
        if (!old.readArticleIds.has(articleId)) return old;
        const newSet = updateStoredReadIds(storageUserId, (current) => {
          const next = new Set(current);
          next.delete(articleId);
          return next;
        });
        return {
          readArticleIds: newSet,
          unreadCount: old.unreadCount + 1,
        };
      });
      return { previous, previousStoredIds, capturedStorageUserId };
    },
    onError: (_err, _articleId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      if (context?.previousStoredIds) {
        saveToLocalStorage(
          context.previousStoredIds,
          context.capturedStorageUserId
        );
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
      const previousStoredIds = loadFromLocalStorage(storageUserId);
      const capturedStorageUserId = storageUserId;
      queryClient.setQueryData(queryKey, (old: ReadStatusCache | undefined) => {
        if (!old) return old;
        const newReadArticleIds = articleIds?.length
          ? updateStoredReadIds(storageUserId, (current) => {
              const next = new Set(current);
              for (const id of articleIds) next.add(id);
              return next;
            })
          : old.readArticleIds;
        return { readArticleIds: newReadArticleIds, unreadCount: 0 };
      });
      return { previous, previousStoredIds, capturedStorageUserId };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      if (context?.previousStoredIds) {
        saveToLocalStorage(
          context.previousStoredIds,
          context.capturedStorageUserId
        );
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
