'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArticleList } from '@/app/components/article/list';
import { LoadingSpinner } from '@/app/components/common/loading-spinner';
import { ServerPagination } from '@/app/components/common/server-pagination';
import type { ArticleWithRelations } from '@/types/models';
import type { ViewMode } from '@/types/components';

interface HomeClientProps {
  viewMode: ViewMode;
}

export function HomeClient({ viewMode }: HomeClientProps) {
  const searchParams = useSearchParams();
  const [articles, setArticles] = useState<ArticleWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    totalPages: 1,
    limit: 24,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function fetchArticles() {
      setLoading(true);
      setError(null);

      try {
        const queryString = searchParams.toString();
        const response = await fetch(
          `/api/articles${queryString ? `?${queryString}` : ''}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch articles');
        }

        const result = await response.json();
        const data = result.data || result;
        setArticles(data.items || data.articles || []);
        setPagination({
          total: data.total ?? 0,
          page: data.page ?? 1,
          totalPages: data.totalPages ?? 1,
          limit: data.limit ?? 24,
        });

        setLoading(false);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setError(error instanceof Error ? error.message : 'An error occurred');
        setLoading(false);
      }
    }

    fetchArticles();
    return () => controller.abort();
  }, [searchParams]);

  if (error) {
    return (
      <div className="text-destructive py-8 text-center">
        エラーが発生しました: {error}
      </div>
    );
  }

  return (
    <>
      {/* 記事リスト */}
      <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        {loading ? (
          <LoadingSpinner message="記事を読み込んでいます..." />
        ) : articles.length > 0 ? (
          <ArticleList articles={articles} viewMode={viewMode} />
        ) : (
          <div className="flex min-h-[600px] items-center justify-center">
            <div className="text-muted-foreground text-center">
              記事が見つかりませんでした
            </div>
          </div>
        )}
      </div>

      {/* ページネーション */}
      {!loading && pagination.totalPages > 1 && (
        <div className="bg-background flex-shrink-0 border-t px-4 py-3 lg:px-6">
          <ServerPagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            searchParams={Object.fromEntries(searchParams.entries())}
          />
        </div>
      )}
    </>
  );
}
