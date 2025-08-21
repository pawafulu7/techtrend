import { useInfiniteQuery } from '@tanstack/react-query';
import { ArticleWithRelations } from '@/types/models';

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
  // フィルタを正規化（undefined値を削除、キーをソート）
  const normalizedFilters = Object.keys(filters)
    .sort()
    .reduce((acc, key) => {
      if (filters[key] !== undefined && filters[key] !== '') {
        acc[key] = filters[key];
      }
      return acc;
    }, {} as ArticleFilters);
  
  return useInfiniteQuery<ArticlesResponse, Error>({
    queryKey: ['infinite-articles', normalizedFilters],
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