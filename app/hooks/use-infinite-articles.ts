import {
  useInfiniteQuery,
  useQueryClient,
  replaceEqualDeep,
  InfiniteData,
} from '@tanstack/react-query';
import { ArticleWithUserData } from '@/types/models';
import { useEffect, useRef, useMemo, useCallback } from 'react';
import { debounce } from '@/lib/utils/debounce';
import {
  buildArticlesRequest,
  infiniteArticlesQueryKey,
  isMobileUserAgent,
  normalizeArticleFilters,
  type ArticleFilters,
} from '@/lib/articles/home-articles-query';

// Favorite change event detail type
interface FavoriteChangedDetail {
  articleId: string;
  isFavorited: boolean;
  timestamp: number;
}

export interface ArticlesResponse {
  data: {
    items: ArticleWithUserData[];
    total: number;
    page: number;
    totalPages: number;
    limit: number;
  };
  /** 画面がこのページを取得した時刻（ms）。取得時刻の表示に使う（issue #707） */
  fetchedAt?: number;
  /** このページの要求を送った時刻（ms）。これより後に成功したお気に入りの変更は応答に入っていない */
  requestedAt?: number;
}

type InfiniteArticlesData = InfiniteData<ArticlesResponse, number>;

export function useInfiniteArticles(
  filters: ArticleFilters,
  options?: { enabled?: boolean }
) {
  const queryClient = useQueryClient();
  const prevFilterKeyRef = useRef<string>('');
  const totalCountRef = useRef<number | undefined>(undefined);
  // Track last favorite update per article to handle race conditions
  // （時刻は古いイベントの無視に、値は取り直しの応答より新しい変更の反映に使う）
  const lastFavoriteUpdateRef = useRef<
    Map<string, { timestamp: number; isFavorited: boolean }>
  >(new Map());

  // Memory cleanup for lastFavoriteUpdateRef (remove entries older than 1 hour)
  useEffect(() => {
    const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
    const MAX_AGE = 60 * 60 * 1000; // 1 hour

    const cleanup = () => {
      const now = Date.now();
      const map = lastFavoriteUpdateRef.current;
      for (const [articleId, { timestamp }] of map.entries()) {
        if (now - timestamp > MAX_AGE) {
          map.delete(articleId);
        }
      }
    };

    const intervalId = setInterval(cleanup, CLEANUP_INTERVAL);
    return () => clearInterval(intervalId);
  }, []);

  // フィルタを正規化（undefined値とreturningを削除、キーをソート）。
  // サーバーで先読みした1ページ目と同じキーになるよう、正規化とキーの作り方は
  // lib/articles/home-articles-query.ts に寄せている（issue #714）
  const normalizedFilters = useMemo(
    () => normalizeArticleFilters(filters),
    [filters]
  );

  // フィルターをJSON文字列化してキーとする（確実な変更検出のため）
  const queryKey = useMemo(
    () => infiniteArticlesQueryKey(normalizedFilters),
    [normalizedFilters]
  );
  const filterKey = queryKey[1];

  // Debounced filter change handler
  // Note: Ref access inside debounce callback is intentional - the callback is only
  // executed in the useEffect below, not during render. The useMemo here memoizes
  // the debounced function creation, not the ref access itself.
  const handleFilterChange = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- Ref accessed in debounce callback, not during render
      debounce((newFilterKey: string) => {
        if (
          prevFilterKeyRef.current &&
          prevFilterKeyRef.current !== newFilterKey
        ) {
          // 旧フィルターのクエリを停止・破棄（新フィルターはキー変更で自動フェッチ）
          queryClient.cancelQueries({
            queryKey: ['infinite-articles', prevFilterKeyRef.current],
          });
          queryClient.removeQueries({
            queryKey: ['infinite-articles', prevFilterKeyRef.current],
          });
        }
        prevFilterKeyRef.current = newFilterKey;
      }, 200),
    [queryClient]
  );

  // フィルターが変更されたときにdebounce処理を実行
  useEffect(() => {
    handleFilterChange(filterKey);

    // フィルター変更時に総件数をリセット（新しいフィルターでは再計算が必要）
    totalCountRef.current = undefined;

    // クリーンアップ: コンポーネントのアンマウント時にpendingな実行をキャンセル
    return () => {
      handleFilterChange.cancel();
    };
  }, [filterKey, handleFilterChange]);

  // 既読状態変更ハンドラ（最適化版）
  const handleReadStatusChanged = useCallback(
    (event: Event) => {
      const customEvent = event as CustomEvent;
      const { articleId, isRead } = customEvent.detail;

      // Debug log removed

      // すべての関連するキャッシュを更新
      const cacheKeys = queryClient.getQueryCache().findAll({
        queryKey: ['infinite-articles'],
        exact: false,
      });

      // Debug log removed

      let _articleFound = false;
      cacheKeys.forEach((query) => {
        queryClient.setQueryData<InfiniteArticlesData>(
          query.queryKey,
          (oldData) => {
            if (oldData?.pages) {
              const newData = {
                ...oldData,
                pages: oldData.pages.map((page: ArticlesResponse) => ({
                  ...page,
                  data: {
                    ...page.data,
                    items: page.data.items.map((item: ArticleWithUserData) => {
                      if (item.id === articleId) {
                        _articleFound = true;
                        // 該当記事の既読状態を更新
                        return {
                          ...item,
                          isRead: isRead,
                          // Note: readAt is not part of the API response, so we don't update it
                        } as typeof item;
                      }
                      return item;
                    }),
                  },
                })),
              };
              return newData;
            }
            return oldData;
          }
        );
      });

      // Debug log removed

      // 注: invalidate（readFilter 付きクエリの再取得・['read-status'] の無効化）は
      // app/providers/query-provider.tsx の同名ハンドラに一本化した。invalidateQueries は
      // cancelRefetch が既定 true のため、二重リスナーだと 2 つ目の invalidate が
      // 進行中の N ページ取得を中断して 1 ページ目から再開させていた。
      // provider 側を残したのは、そちらが ['digest'] の無効化も行っており
      // フック側に統一すると digest 同期が消えるため。
      // ここは setQueryData による楽観更新のみを担当する。
    },
    [queryClient]
  );

  // お気に入り変更ハンドラ（React Queryキャッシュ同期用）
  const handleFavoriteChanged = useCallback(
    (event: Event) => {
      const customEvent = event as CustomEvent<FavoriteChangedDetail>;
      const { articleId, isFavorited, timestamp } = customEvent.detail;

      // Race condition prevention: ignore older events
      const lastUpdate =
        lastFavoriteUpdateRef.current.get(articleId)?.timestamp || 0;
      if (timestamp < lastUpdate) return;
      lastFavoriteUpdateRef.current.set(articleId, { timestamp, isFavorited });

      // Update all infinite-articles caches using setQueriesData
      queryClient.setQueriesData<InfiniteArticlesData>(
        { queryKey: ['infinite-articles'], exact: false },
        (oldData) => {
          if (!oldData?.pages) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page: ArticlesResponse) => ({
              ...page,
              data: {
                ...page.data,
                items: page.data.items.map((item: ArticleWithUserData) =>
                  item.id === articleId ? { ...item, isFavorited } : item
                ),
              },
            })),
          };
        }
      );
    },
    [queryClient]
  );

  // 注: 'articles-bulk-read' のリスナーはここに置かない。
  // app/providers/query-provider.tsx の handleBulkRead に一本化してある
  // （二重 invalidate による N ページ取得の中断・再開を避けるため。provider 側は
  //  ['infinite-articles'] に加えて ['read-status'] / ['digest'] も無効化する）。

  // 既読状態が変更されたときに記事リストを再取得
  useEffect(() => {
    window.addEventListener(
      'article-read-status-changed',
      handleReadStatusChanged as EventListener
    );

    return () => {
      window.removeEventListener(
        'article-read-status-changed',
        handleReadStatusChanged as EventListener
      );
    };
  }, [handleReadStatusChanged]);

  // お気に入り変更イベントをリッスン
  useEffect(() => {
    window.addEventListener(
      'article-favorite-changed',
      handleFavoriteChanged as EventListener
    );

    return () => {
      window.removeEventListener(
        'article-favorite-changed',
        handleFavoriteChanged as EventListener
      );
    };
  }, [handleFavoriteChanged]);

  // 注: bfcache復元（pageshow）での一覧再取得は行わない。
  // 一覧の内容はcronでしか変わらず、取り直す価値がないため。
  //
  // 既知の制約: 一覧カードの既読バッジは item.isRead prop 由来
  // （app/components/article/hooks/use-read-status.ts が導出する）で、その item は
  // この ['infinite-articles'] キャッシュそのものである。
  // app/hooks/use-read-status.ts の ['read-status'] は mark-all-read-wrapper.tsx
  // からしか参照されておらず、カードの表示には関与しない。
  // したがって bfcache 復元後、別タブ等で変わった既読状態はカードのバッジに
  // 反映されず復元前のまま残りうる。
  // 受容する理由: bfcache 復元の発火経路自体が極小である。SPA 内遷移では
  // pageshow(persisted) が発火せず、BASIC 認証ゲート環境では no-store により
  // そもそも bfcache の対象外になる。
  // 全ページの取り直し（手動更新など）は、全ページを取り終えてからキャッシュを置き換える。
  // その途中で成功したお気に入りの変更は、先に取ったページの応答に入っておらず、
  // 置き換えで巻き戻る。要求を送った後に成功した変更を重ねてからキャッシュに書く（issue #707）。
  // select ではなく structuralSharing で行うのは、select の結果はキャッシュに残らず、
  // 一覧を再マウントすると巻き戻った値が出るため
  const applyNewerFavorites = useCallback(
    (data: InfiniteData<ArticlesResponse>): InfiniteData<ArticlesResponse> => {
      const updates = lastFavoriteUpdateRef.current;
      if (updates.size === 0) return data;
      let changed = false;
      const pages = data.pages.map((page) => {
        const { requestedAt } = page;
        if (requestedAt === undefined) return page;
        let pageChanged = false;
        const items = page.data.items.map((item) => {
          const update = updates.get(item.id);
          if (
            !update ||
            update.timestamp <= requestedAt ||
            item.isFavorited === update.isFavorited
          ) {
            return item;
          }
          pageChanged = true;
          return { ...item, isFavorited: update.isFavorited };
        });
        if (!pageChanged) return page;
        changed = true;
        return { ...page, data: { ...page.data, items } };
      });
      return changed ? { ...data, pages } : data;
    },
    []
  );
  const shareWithNewerFavorites = useCallback(
    (oldData: unknown, newData: unknown) => {
      const data = newData as InfiniteData<ArticlesResponse> | undefined;
      return replaceEqualDeep(
        oldData,
        data?.pages ? applyNewerFavorites(data) : newData
      );
    },
    [applyNewerFavorites]
  );

  const infiniteQuery = useInfiniteQuery<ArticlesResponse, Error>({
    queryKey,
    structuralSharing: shareWithNewerFavorites,
    queryFn: async ({ pageParam, signal }) => {
      const currentPage = (pageParam as number) || 1;

      // page > 1 では総件数を送って COUNT を省く。サーバーで先読みしたページや
      // キャッシュから戻ったページは、この queryFn を通らないので ref が空になる。
      // そのときは読み込み済みの1ページ目の総件数を使う
      const total =
        totalCountRef.current ??
        queryClient.getQueryData<InfiniteArticlesData>(queryKey)?.pages[0]
          ?.data.total;

      // パフォーマンス最適化: デフォルトで軽量モード
      // モバイルまたは低速接続では lightweight=true を使用
      const isMobile = isMobileUserAgent(navigator.userAgent);
      const isSlowConnection =
        (navigator as any).connection?.effectiveType === 'slow-2g' ||
        (navigator as any).connection?.effectiveType === '2g';

      const { endpoint, searchParams } = buildArticlesRequest(
        normalizedFilters,
        {
          page: currentPage,
          total,
          lightweight: isMobile || isSlowConnection,
        }
      );

      const requestedAt = Date.now();
      const response = await fetch(`${endpoint}?${searchParams.toString()}`, {
        signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          let message = 'ログインが必要です。再度ログインしてください。';
          try {
            const errorData = await response.json();
            if (errorData?.error?.message) {
              message = errorData.error.message;
            }
          } catch {
            // response.json() failed - keep default message
          }
          throw new Error(message);
        }
        throw new Error(
          `Failed to fetch articles: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      // Debug log removed

      // 総件数を保存（次ページ取得時のCOUNTクエリスキップ用）
      if (data?.data?.total) {
        totalCountRef.current = data.data.total;
      }

      // dataUpdatedAt はお気に入りの反映（setQueryData）でも進むため、取得時刻は
      // ページ自体に持たせる
      return { ...data, fetchedAt: Date.now(), requestedAt };
    },
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.data;
      return page < totalPages ? page + 1 : undefined;
    },
    initialPageParam: 1,
    // mount / focus / reconnect / interval の自動再取得はすべて無効にしている
    // （一覧は cron でしか変わらない、という判断に基づく意図的なトレードオフ）。
    // 新着はホームの手動更新（refetch。読み込み済みの全ページを取り直す）で取り込む
    // （issue #707）。
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30, // 30分間メモリに保持（データ転送削減、10分→30分に延長）
    refetchOnWindowFocus: false, // 通常はfalse（パフォーマンスのため）
    refetchOnMount: false, // マウント時の再取得はしない（一覧はcronでしか更新されない）
    // 未設定だと networkMode !== 'always' により既定 true になり、online イベント
    // （スリープ復帰・WiFi 再接続）で読み込み済みの全ページが 1 ページ目から
    // 取り直される。ページを蓄積する infinite query 固有の問題なので、グローバル
    // 既定ではなくここで個別に無効化する（グローバルに置くと、fetch 失敗後の
    // クエリがネットワーク復帰で自動復帰しなくなる副作用が全クエリに及ぶ）。
    refetchOnReconnect: false,
    // 重複リクエスト防止のための設定
    refetchInterval: false, // 自動リフェッチを無効化
    retry: 1, // リトライ回数を制限
    retryDelay: 1000, // リトライ間隔を設定
    enabled: options?.enabled,
  });

  return infiniteQuery;
}
