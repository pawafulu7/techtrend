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
  const normalizedFilters = Object.keys(filters)
    .sort()
    .reduce((acc, key) => {
      if (filters[key] !== undefined && filters[key] !== '') {
        acc[key] = filters[key];
      }
      return acc;
    }, {} as ArticleFilters);
  
  // フィルターをJSON文字列化してキーとする（確実な変更検出のため）
  const filterKey = JSON.stringify(normalizedFilters);
  
  // Debounced filter change handler
  const handleFilterChange = useMemo(
    () => debounce((newFilterKey: string) => {
      if (prevFilterKeyRef.current && prevFilterKeyRef.current !== newFilterKey) {
        // 古いフィルターキーから現在のデータを取得
        const oldFilterKey = prevFilterKeyRef.current;
        const currentData = queryClient.getQueryData<InfiniteArticlesData>(['infinite-articles', oldFilterKey]);
        
        // 新しいフィルターキーに最初のページのみ転送（ちらつき防止）
        if (currentData?.pages?.[0]) {
          queryClient.setQueryData(['infinite-articles', newFilterKey], {
            ...currentData,
            pages: [currentData.pages[0]],
            pageParams: [1]
          });
        }
        
        // その後、新しいデータを取得
        queryClient.invalidateQueries({ queryKey: ['infinite-articles', newFilterKey] });
      }
      prevFilterKeyRef.current = newFilterKey;
    }, 300),
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
      queryClient.setQueryData(['infinite-articles', filterKey], (oldData: InfiniteArticlesData | undefined) => {
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
  
  return useInfiniteQuery<ArticlesResponse, Error>({
    queryKey: ['infinite-articles', filterKey],
    queryFn: async ({ pageParam = 1 }) => {
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
      searchParams.set('limit', '20');
      
      // パフォーマンス最適化: 軽量版APIを使用（既読フィルタがない場合）
      const endpoint = normalizedFilters.readFilter ? '/api/articles' : '/api/articles/list';
      const response = await fetch(`${endpoint}?${searchParams.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch articles');
      }
      
      return response.json();
    },
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.data;
      return page < totalPages ? page + 1 : undefined;
    },
    initialPageParam: 1,
    staleTime: 1000 * 60 * 5, // 5分間キャッシュ
    refetchOnWindowFocus: false,
  });
}