import { useInfiniteQuery, useQueryClient, InfiniteData } from '@tanstack/react-query';
import { ArticleWithRelations } from '@/types/models';
import { useEffect, useRef, useMemo, useCallback } from 'react';
import { debounce } from '@/lib/utils/debounce';

// Favorite change event detail type
interface FavoriteChangedDetail {
  articleId: string;
  isFavorited: boolean;
  timestamp: number;
}

interface ArticleFilters {
  keyword?: string;
  sourceId?: string;
  tags?: string;
  dateRange?: string;
  readFilter?: string;
  lightweight?: boolean;  // Add lightweight mode flag
  includeRelations?: boolean;  // Add relations flag
  includeUserData?: boolean;  // Add user data flag for favorites and read status
  excludeUnprocessed?: boolean;  // Add flag to exclude articles without summaries
  [key: string]: string | boolean | undefined;
}

interface ArticlesResponse {
  data: {
    items: ArticleWithRelations[];
    total: number;
    page: number;
    totalPages: number;
    limit: number;
  };
}

type InfiniteArticlesData = InfiniteData<ArticlesResponse, number>;

export function useInfiniteArticles(filters: ArticleFilters) {
  const queryClient = useQueryClient();
  const prevFilterKeyRef = useRef<string>('');
  const totalCountRef = useRef<number | undefined>(undefined);
  // Track last update timestamp per article to handle race conditions
  const lastFavoriteUpdateRef = useRef<Map<string, number>>(new Map());

  // フィルタを正規化（undefined値を削除、キーをソート）
  const normalizedFilters = useMemo(() => {
    return Object.keys(filters)
      .sort()
      .reduce((acc, key) => {
        if (filters[key] !== undefined && filters[key] !== '') {
          acc[key] = filters[key]!;
        }
        return acc;
      }, {} as ArticleFilters);
  }, [filters]);
  
  // フィルターをJSON文字列化してキーとする（確実な変更検出のため）
  const filterKey = useMemo(() => JSON.stringify(normalizedFilters), [normalizedFilters]);
  
  // Debounced filter change handler
  const handleFilterChange = useMemo(
    () => debounce((newFilterKey: string) => {
      if (prevFilterKeyRef.current && prevFilterKeyRef.current !== newFilterKey) {
        // 旧フィルターのクエリを停止・破棄（新フィルターはキー変更で自動フェッチ）
        queryClient.cancelQueries({ queryKey: ['infinite-articles', prevFilterKeyRef.current] });
        queryClient.removeQueries({ queryKey: ['infinite-articles', prevFilterKeyRef.current] });
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
  const handleReadStatusChanged = useCallback((event: Event) => {
    const customEvent = event as CustomEvent;
    const { articleId, isRead } = customEvent.detail;

    // Debug log removed

    // すべての関連するキャッシュを更新
    const cacheKeys = queryClient.getQueryCache().findAll({
      queryKey: ['infinite-articles'],
      exact: false
    });

    // Debug log removed

    let _articleFound = false;
    cacheKeys.forEach((query) => {
      queryClient.setQueryData<InfiniteArticlesData>(query.queryKey, (oldData) => {
        if (oldData?.pages) {
          const newData = {
            ...oldData,
            pages: oldData.pages.map((page: ArticlesResponse) => ({
              ...page,
              data: {
                ...page.data,
                items: page.data.items.map((item: ArticleWithRelations) => {
                  if (item.id === articleId) {
                    _articleFound = true;
                    // 該当記事の既読状態を更新
                    return {
                      ...item,
                      isRead: isRead
                      // Note: readAt is not part of the API response, so we don't update it
                    } as typeof item;
                  }
                  return item;
                })
              }
            }))
          };
          return newData;
        }
        return oldData;
      });
    });

    // Debug log removed

    // 既読フィルターが有効な場合のみ再取得
    if (normalizedFilters.readFilter) {
      queryClient.invalidateQueries({
        queryKey: ['infinite-articles', filterKey],
        refetchType: 'active'
      });
    }

    // 既読状態のキャッシュも無効化
    queryClient.invalidateQueries({ queryKey: ['read-status'] });
  }, [normalizedFilters.readFilter, filterKey, queryClient]);

  // お気に入り変更ハンドラ（React Queryキャッシュ同期用）
  const handleFavoriteChanged = useCallback((event: Event) => {
    const customEvent = event as CustomEvent<FavoriteChangedDetail>;
    const { articleId, isFavorited, timestamp } = customEvent.detail;

    // Race condition prevention: ignore older events
    const lastUpdate = lastFavoriteUpdateRef.current.get(articleId) || 0;
    if (timestamp < lastUpdate) return;
    lastFavoriteUpdateRef.current.set(articleId, timestamp);

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
              items: page.data.items.map((item: ArticleWithRelations) =>
                item.id === articleId ? { ...item, isFavorited } : item
              ),
            },
          })),
        };
      }
    );
  }, [queryClient]);

  // 一括既読ハンドラ（invalidateQueriesで再取得）
  const handleBulkRead = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['infinite-articles'],
      refetchType: 'active'
    });
  }, [queryClient]);

  // 既読状態が変更されたときに記事リストを再取得
  useEffect(() => {
    window.addEventListener('article-read-status-changed', handleReadStatusChanged as EventListener);

    return () => {
      window.removeEventListener('article-read-status-changed', handleReadStatusChanged as EventListener);
    };
  }, [handleReadStatusChanged]);

  // お気に入り変更イベントをリッスン
  useEffect(() => {
    window.addEventListener('article-favorite-changed', handleFavoriteChanged as EventListener);

    return () => {
      window.removeEventListener('article-favorite-changed', handleFavoriteChanged as EventListener);
    };
  }, [handleFavoriteChanged]);

  // 一括既読イベントをリッスン
  useEffect(() => {
    window.addEventListener('articles-bulk-read', handleBulkRead);

    return () => {
      window.removeEventListener('articles-bulk-read', handleBulkRead);
    };
  }, [handleBulkRead]);

  // bfcache復元時にキャッシュを無効化して再取得
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // bfcacheから復元された場合、既読状態が変わっている可能性があるので再取得
        // 現在のフィルターのクエリのみ無効化（他のフィルター設定は保持）
        queryClient.invalidateQueries({
          queryKey: ['infinite-articles', filterKey],
          refetchType: 'active'
        });
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [queryClient, filterKey]);
  
  const infiniteQuery = useInfiniteQuery<ArticlesResponse, Error>({
    queryKey: ['infinite-articles', filterKey],
    queryFn: async ({ pageParam, signal }) => {
      const currentPage = pageParam as number || 1;
      // 毎回新しいURLSearchParamsを作成
      const searchParams = new URLSearchParams();

      // フィルターパラメータを追加
      Object.entries(normalizedFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.append(key, String(value));
        }
      });

      // ページパラメータを追加
      searchParams.set('page', String(currentPage));
      searchParams.set('limit', '20');

      // page > 1の場合、前回のレスポンスから総件数を送信（COUNTクエリスキップ用）
      if (currentPage > 1 && totalCountRef.current) {
        searchParams.set('total', String(totalCountRef.current));
      }

      // パフォーマンス最適化: デフォルトで軽量モード
      // モバイルまたは低速接続では lightweight=true を使用
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      const isSlowConnection = (navigator as any).connection?.effectiveType === 'slow-2g' || (navigator as any).connection?.effectiveType === '2g';

      if (isMobile || isSlowConnection) {
        searchParams.set('lightweight', 'true');
      }

      // パフォーマンス最適化: 軽量版APIを使用（既読フィルタ/パーソナライズがない場合）
      // パーソナライズフィルタがある場合は /api/articles を使用（categoryFilterServiceが必要）
      const hasCategoryIds = normalizedFilters.categoryIds && String(normalizedFilters.categoryIds).length > 0;
      const hasPeriodMonths = normalizedFilters.periodMonths && Number(normalizedFilters.periodMonths) > 0;
      const useFullApi = normalizedFilters.readFilter || hasCategoryIds || hasPeriodMonths;
      const endpoint = useFullApi ? '/api/articles' : '/api/articles/list';

      // includeRelations はデフォルトで false（APIサイドで設定済み）
      // パーソナライズ時またはフルAPI使用時は source 情報が必要なため true を設定
      if (normalizedFilters.includeRelations || useFullApi) {
        searchParams.set('includeRelations', 'true');
      }

      // includeUserData を条件付きで設定（キャッシュバイパスを避けるため）
      // 既読フィルタがある場合またはユーザーデータが明示的に要求された場合のみ
      if (normalizedFilters.readFilter || normalizedFilters.includeUserData) {
        searchParams.set('includeUserData', 'true');
      }

      // Debug log removed

      const response = await fetch(`${endpoint}?${searchParams.toString()}`, { signal });

      if (!response.ok) {
        throw new Error(`Failed to fetch articles: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Debug log removed

      // 総件数を保存（次ページ取得時のCOUNTクエリスキップ用）
      if (data?.data?.total) {
        totalCountRef.current = data.data.total;
      }

      return data;
    },
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.data;
      return page < totalPages ? page + 1 : undefined;
    },
    initialPageParam: 1,
    staleTime: normalizedFilters.returning ? 0 : 1000 * 60 * 5, // 記事詳細から戻った時のみ即座に再取得、通常は5分間キャッシュ（1分→5分に延長）
    gcTime: 1000 * 60 * 30, // 30分間メモリに保持（データ転送削減、10分→30分に延長）
    refetchOnWindowFocus: false, // 通常はfalse（パフォーマンスのため）
    refetchOnMount: normalizedFilters.returning ? 'always' : false, // 記事詳細から戻った時のみ再取得
    // 重複リクエスト防止のための設定
    refetchInterval: false, // 自動リフェッチを無効化
    retry: 1, // リトライ回数を制限
    retryDelay: 1000, // リトライ間隔を設定
  });
  
  return infiniteQuery;
}
