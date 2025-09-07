import { useInfiniteQuery, useQueryClient, InfiniteData } from '@tanstack/react-query';
import { ArticleWithRelations } from '@/types/models';
import { useEffect, useRef, useMemo, useCallback } from 'react';
import { debounce } from '@/lib/utils/debounce';

interface ArticleFilters {
  keyword?: string;
  sourceId?: string;
  tags?: string;
  dateRange?: string;
  readFilter?: string;
  [key: string]: string | undefined;
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
    
    // クリーンアップ: コンポーネントのアンマウント時にpendingな実行をキャンセル
    return () => {
      handleFilterChange.cancel();
    };
  }, [filterKey, handleFilterChange]);
  
  // 既読状態変更ハンドラ（最適化版）
  const handleReadStatusChanged = useCallback(() => {
    // 既読フィルターが有効な場合のみ再取得
    if (normalizedFilters.readFilter) {
      // 部分的な更新のみ実施（全体再取得を避ける）
      queryClient.setQueryData<InfiniteArticlesData>(['infinite-articles', filterKey], (oldData) => {
        if (oldData?.pages) {
          // 既読状態のみ更新（optimistic update）
          return {
            ...oldData,
            pages: oldData.pages.map((page: ArticlesResponse) => ({
              ...page,
              data: {
                ...page.data,
                items: page.data.items.map((item: ArticleWithRelations) => ({
                  ...item,
                  // 既読状態を更新（楽観的更新）
                  isRead: true,
                  readAt: new Date().toISOString()
                }))
              }
            }))
          };
        }
        return oldData;
      });
      
      // バックグラウンドで実際のデータを取得
      queryClient.invalidateQueries({ 
        queryKey: ['infinite-articles', filterKey],
        refetchType: 'active' // アクティブなクエリのみ再取得
      });
    }
    
    // 既読状態のキャッシュも無効化
    queryClient.invalidateQueries({ queryKey: ['read-status'] });
  }, [normalizedFilters.readFilter, filterKey, queryClient]);
  
  // 既読状態が変更されたときに記事リストを再取得
  useEffect(() => {
    window.addEventListener('articles-read-status-changed', handleReadStatusChanged);
    
    return () => {
      window.removeEventListener('articles-read-status-changed', handleReadStatusChanged);
    };
  }, [handleReadStatusChanged]);
  
  const infiniteQuery = useInfiniteQuery<ArticlesResponse, Error>({
    queryKey: ['infinite-articles', filterKey],
    queryFn: async ({ pageParam = 1, signal }) => {
      // 毎回新しいURLSearchParamsを作成
      const searchParams = new URLSearchParams();
      
      // フィルターパラメータを追加
      Object.entries(normalizedFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.append(key, value);
        }
      });
      
      // ページパラメータを追加
      searchParams.set('page', String(pageParam));
      // 復元モードかどうかを判定（URLに'returning'パラメータがあるか）
      const isRestorationMode = typeof window !== 'undefined' && 
        new URLSearchParams(window.location.search).has('returning');
      // 復元モード時は100件、通常時は20件のページサイズを設定
      const pageLimit = isRestorationMode ? 100 : 20;
      searchParams.set('limit', String(pageLimit));
      
      // パフォーマンス最適化: 軽量版APIを使用（既読フィルタがない場合）
      const endpoint = normalizedFilters.readFilter ? '/api/articles' : '/api/articles/list';
      const response = await fetch(`${endpoint}?${searchParams.toString()}`, { signal });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch articles: ${response.status} ${response.statusText}`);
      }
      
      return response.json();
    },
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.data;
      return page < totalPages ? page + 1 : undefined;
    },
    initialPageParam: 1,
    staleTime: 1000 * 60 * 5, // 5分間キャッシュ（Firefox互換性改善）
    refetchOnWindowFocus: false,
  });
  
  return infiniteQuery;
}