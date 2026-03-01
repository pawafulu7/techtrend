'use client';

import {
  QueryClient,
  QueryClientProvider,
  InfiniteData,
} from '@tanstack/react-query';
import dynamic from 'next/dynamic';

const ReactQueryDevtools = dynamic(
  () =>
    import('@tanstack/react-query-devtools').then((mod) => ({
      default: mod.ReactQueryDevtools,
    })),
  { ssr: false }
);
import { useEffect, useState, useRef } from 'react';
import type { ArticleWithUserData } from '@/types/models';

interface FavoriteChangedDetail {
  articleId: string;
  isFavorited: boolean;
  timestamp: number;
}

interface ReadStatusChangedDetail {
  articleId: string;
  isRead: boolean;
}

interface BulkReadDetail {
  isRead: boolean;
}

interface ArticlesResponse {
  data: {
    items: ArticleWithUserData[];
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
      const timestamp = Number.isFinite(detail.timestamp)
        ? detail.timestamp
        : Date.now();

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
      window.removeEventListener(
        'article-favorite-changed',
        handleFavoriteChanged
      );
    };
  }, [queryClient]);

  useEffect(() => {
    const invalidateReadRelatedQueries = () => {
      queryClient.invalidateQueries({ queryKey: ['read-status'] });
      queryClient.invalidateQueries({ queryKey: ['digest'] });
    };

    const handleReadStatusChanged = (event: Event) => {
      const customEvent = event as CustomEvent<ReadStatusChangedDetail>;
      const detail = customEvent.detail;
      if (!detail?.articleId) {
        return;
      }

      const { articleId, isRead } = detail;

      queryClient.setQueriesData<InfiniteArticlesData>(
        { queryKey: ['infinite-articles'], exact: false },
        (oldData) => {
          if (!oldData?.pages) return oldData;
          let changed = false;
          const pages = oldData.pages.map((page) => {
            if (!page?.data?.items) return page;
            let pageChanged = false;
            const items = page.data.items.map((item) => {
              if (item.id !== articleId || item.isRead === isRead) return item;
              pageChanged = true;
              changed = true;
              return { ...item, isRead };
            });
            return pageChanged
              ? { ...page, data: { ...page.data, items } }
              : page;
          });
          return changed ? { ...oldData, pages } : oldData;
        }
      );

      // Read/unread filters may need a refetch to adjust membership
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ['infinite-articles'], exact: false })
        .forEach((query) => {
          if (!Array.isArray(query.queryKey)) return;
          const filterKey = query.queryKey[1];
          if (typeof filterKey !== 'string') return;
          try {
            const parsed = JSON.parse(filterKey) as { readFilter?: string };
            if (parsed?.readFilter) {
              queryClient.invalidateQueries({
                queryKey: query.queryKey,
                refetchType: 'active',
              });
            }
          } catch {
            // Ignore non-JSON filter keys
          }
        });

      invalidateReadRelatedQueries();
    };

    const handleBulkRead = (event: Event) => {
      const customEvent = event as CustomEvent<BulkReadDetail>;
      if (!customEvent.detail?.isRead) {
        return;
      }

      queryClient.invalidateQueries({
        queryKey: ['infinite-articles'],
        refetchType: 'active',
      });
      invalidateReadRelatedQueries();
    };

    window.addEventListener(
      'article-read-status-changed',
      handleReadStatusChanged
    );
    window.addEventListener('articles-bulk-read', handleBulkRead);
    return () => {
      window.removeEventListener(
        'article-read-status-changed',
        handleReadStatusChanged
      );
      window.removeEventListener('articles-bulk-read', handleBulkRead);
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
