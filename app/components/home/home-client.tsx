'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArticleList } from '@/app/components/article/list';
import { ArticleSkeleton } from '@/app/components/article/article-skeleton';
import { ServerPagination } from '@/app/components/common/server-pagination';
import type { Article, Source, Tag } from '@prisma/client';

type ArticleWithRelations = Article & {
  source: Source;
  tags: Tag[];
};

interface HomeClientProps {
  viewMode: 'grid' | 'list';
  sources: Source[];
  tags: Array<Tag & { count: number }>;
}

export function HomeClient({ viewMode, sources, tags }: HomeClientProps) {
  const searchParams = useSearchParams();
  const [articles, setArticles] = useState<ArticleWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    totalPages: 1,
    limit: 24
  });

  useEffect(() => {
    async function fetchArticles() {
      setLoading(true);
      setError(null);
      
      try {
        // URLパラメータからクエリ文字列を構築
        const queryString = searchParams.toString();
        const response = await fetch(`/api/articles${queryString ? `?${queryString}` : ''}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch articles');
        }
        
        const data = await response.json();
        setArticles(data.articles || []);
        setPagination({
          total: data.total || 0,
          page: data.page || 1,
          totalPages: data.totalPages || 1,
          limit: data.limit || 24
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchArticles();
  }, [searchParams]);

  if (error) {
    return (
      <div className="text-center text-red-500 py-8">
        エラーが発生しました: {error}
      </div>
    );
  }

  return (
    <>
      {/* 記事リスト */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4">
        {loading ? (
          <ArticleSkeleton />
        ) : (
          <div className="animate-in fade-in-0 duration-500">
            <ArticleList articles={articles} viewMode={viewMode} />
          </div>
        )}
      </div>

      {/* ページネーション */}
      {!loading && pagination.totalPages > 1 && (
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 lg:px-6 py-3 animate-in fade-in-0 duration-500 delay-200">
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