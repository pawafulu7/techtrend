import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { ArticleWithRelations } from '@/types/models';
import { useEffect, useRef } from 'react';

interface ArticleFilters {
  keyword?: string;
  sourceId?: string;
  tags?: string;
  dateRange?: string;
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
  
  // フィルターが変更されたときに、すべてのinfinite-articlesクエリをリセット
  useEffect(() => {
    if (prevFilterKeyRef.current && prevFilterKeyRef.current !== filterKey) {
      // すべてのinfinite-articlesクエリを削除
      queryClient.removeQueries({ queryKey: ['infinite-articles'] });
      // キャッシュを完全にクリア
      queryClient.invalidateQueries({ queryKey: ['infinite-articles'] });
    }
    prevFilterKeyRef.current = filterKey;
  }, [filterKey, queryClient]);
  
  // 既読状態が変更されたときに記事リストを再取得
  useEffect(() => {
    const handleReadStatusChanged = () => {
      // まずキャッシュを無効化してから再取得
      queryClient.invalidateQueries({ queryKey: ['infinite-articles'] });
      // 既読状態のキャッシュも無効化
      queryClient.invalidateQueries({ queryKey: ['read-status'] });
    };
    
    window.addEventListener('articles-read-status-changed', handleReadStatusChanged);
    
    return () => {
      window.removeEventListener('articles-read-status-changed', handleReadStatusChanged);
    };
  }, [queryClient]);
  
  return useInfiniteQuery<ArticlesResponse, Error>({
    queryKey: ['infinite-articles', filterKey],
    queryFn: async ({ pageParam = 1 }) => {
      // 毎回新しいURLSearchParamsを作成
      const searchParams = new URLSearchParams();
      
      // フィルターパラメータを追加
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.append(key, value);
        }
      });
      
      // ページパラメータを追加
      searchParams.set('page', String(pageParam));
      searchParams.set('limit', '20');
      
      const response = await fetch(`/api/articles?${searchParams.toString()}`);
      
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