'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { ArticleList } from '@/app/components/article/list';
import { LoadingSpinner } from '@/app/components/common/loading-spinner';
import { ServerPagination } from '@/app/components/common/server-pagination';
import type { ArticleWithRelations } from '@/types/models';
import type { ViewMode } from '@/types/components';

interface HomeClientProps {
  viewMode: ViewMode;
}

interface ArticlePagination {
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

interface ArticleListResult {
  articles: ArticleWithRelations[];
  pagination: ArticlePagination;
}

async function fetchArticles(queryString: string): Promise<ArticleListResult> {
  const response = await fetch(
    `/api/articles${queryString ? `?${queryString}` : ''}`
  );
  if (!response.ok) {
    throw new Error('Failed to fetch articles');
  }
  const result = await response.json();
  const data = result.data || result;
  return {
    articles: data.items || data.articles || [],
    pagination: {
      total: data.total ?? 0,
      page: data.page ?? 1,
      totalPages: data.totalPages ?? 1,
      limit: data.limit ?? 24,
    },
  };
}

export function HomeClient({ viewMode }: HomeClientProps) {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  const {
    data,
    isLoading: loading,
    isError,
    error,
  } = useQuery<ArticleListResult>({
    queryKey: ['article-list', queryString],
    queryFn: () => fetchArticles(queryString),
    placeholderData: keepPreviousData,
  });

  const articles = data?.articles ?? [];
  const pagination = data?.pagination ?? {
    total: 0,
    page: 1,
    totalPages: 1,
    limit: 24,
  };

  if (isError) {
    return (
      <div className="text-destructive py-8 text-center">
        エラーが発生しました:{' '}
        {error instanceof Error ? error.message : 'An error occurred'}
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
