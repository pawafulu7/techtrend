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
  const searchParams = new URLSearchParams();
  
  // フィルターパラメータを追加
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      searchParams.append(key, value);
    }
  });

  return useInfiniteQuery<ArticlesResponse, Error>({
    queryKey: ['infinite-articles', filters],
    queryFn: async ({ pageParam }) => {
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