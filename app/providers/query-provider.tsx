'use client';

import { QueryClient, QueryClientProvider, InfiniteData } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect, useState, useRef } from 'react';
import type { ArticleWithRelations } from '@/types/models';

interface FavoriteChangedDetail {
  articleId: string;
  isFavorited: boolean;
  timestamp: number;
}

interface ArticlesResponse {
  data: {
    items: ArticleWithRelations[];
  };
}

type InfiniteArticlesData = InfiniteData<ArticlesResponse, number>;

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5分
            gcTime: 10 * 60 * 1000, // 10分（旧 cacheTime）
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  const lastFavoriteUpdateRef = useRef<Map<string, number>>(new Map());

  // Global listener for cross-screen cache sync
  useEffect(() => {
    const handleFavoriteChanged = (event: Event) => {
      const customEvent = event as CustomEvent<FavoriteChangedDetail>;
      const detail = customEvent.detail;
      if (!detail?.articleId) {
        return;
      }
      const { articleId, isFavorited } = detail;
      const timestamp = Number.isFinite(detail.timestamp) ? detail.timestamp : Date.now();

      const lastUpdate = lastFavoriteUpdateRef.current.get(articleId) || 0;
      if (timestamp < lastUpdate) return;
      lastFavoriteUpdateRef.current.set(articleId, timestamp);

      queryClient.setQueriesData<InfiniteArticlesData>(
        { queryKey: ['infinite-articles'], exact: false },
        (oldData) => {
          if (!oldData?.pages) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) => {
              if (!page?.data?.items) return page;
              return {
                ...page,
                data: {
                  ...page.data,
                  items: page.data.items.map((item) =>
                    item.id === articleId ? { ...item, isFavorited } : item
                  ),
                },
              };
            }),
          };
        }
      );

      // Invalidate both favorites and articles caches
      queryClient.invalidateQueries({
        queryKey: ['infinite-favorites'],
      });
      queryClient.invalidateQueries({
        queryKey: ['infinite-articles'],
      });
    };

    window.addEventListener('article-favorite-changed', handleFavoriteChanged);
    return () => {
      window.removeEventListener('article-favorite-changed', handleFavoriteChanged);
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
