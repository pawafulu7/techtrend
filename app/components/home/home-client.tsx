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
  showInitialSkeleton?: boolean;
}

export function HomeClient({ viewMode, sources, tags, showInitialSkeleton = true }: HomeClientProps) {
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
  const [totalCount, setTotalCount] = useState<number | null>(null);

  useEffect(() => {
    async function fetchArticles() {
      setLoading(true);
      setError(null);
      
      try {
        // 少し遅延を入れてスムーズな遷移を実現
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // URLパラメータからクエリ文字列を構築
        const queryString = searchParams.toString();
        const response = await fetch(`/api/articles${queryString ? `?${queryString}` : ''}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch articles');
        }
        
        const result = await response.json();
        // APIレスポンスがdata.itemsにラップされている
        const data = result.data || result;
        setArticles(data.items || data.articles || []);
        setPagination({
          total: data.total || 0,
          page: data.page || 1,
          totalPages: data.totalPages || 1,
          limit: data.limit || 24
        });
        setTotalCount(data.total || 0);
        
        // アニメーション開始を少し遅らせる
        requestAnimationFrame(() => {
          setLoading(false);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
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
        ) : articles.length > 0 ? (
          <ArticleList articles={articles} viewMode={viewMode} />
        ) : !loading ? (
          <div className="flex items-center justify-center min-h-[600px]">
            <div className="text-center text-gray-500">
              記事が見つかりませんでした
            </div>
          </div>
        ) : null}
      </div>

      {/* ページネーション */}
      {!loading && pagination.totalPages > 1 && (
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 lg:px-6 py-3">
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