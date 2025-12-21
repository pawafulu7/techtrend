'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect, useState } from 'react';

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

  // Global listener for cross-screen cache sync
  useEffect(() => {
    const handleFavoriteChanged = () => {
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
