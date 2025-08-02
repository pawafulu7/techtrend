'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ArticleCard } from '@/app/components/article/card';
import { SearchFilters } from '@/app/components/search/SearchFilters';
import { SearchResults } from '@/app/components/search/SearchResults';
import type { ArticleWithRelations } from '@/types/models';

interface SearchResponse {
  articles: ArticleWithRelations[];
  totalCount: number;
  facets: {
    tags: { name: string; count: number }[];
    sources: { name: string; count: number }[];
    difficulty: { level: string; count: number }[];
  };
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const performSearch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams(searchParams);
      params.set('page', page.toString());
      
      const response = await fetch(`/api/articles/search?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('検索エラーが発生しました');
      }

      const data: SearchResponse = await response.json();
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '検索中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [searchParams, page]);

  useEffect(() => {
    performSearch();
  }, [performSearch]);

  const query = searchParams.get('q') || '';
  const selectedTags = searchParams.getAll('tags');
  const selectedSources = searchParams.getAll('sources');
  const selectedDifficulty = searchParams.getAll('difficulty');

  const hasFilters = selectedTags.length > 0 || 
                    selectedSources.length > 0 || 
                    selectedDifficulty.length > 0;

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            {query ? `"${query}" の検索結果` : '検索結果'}
          </h1>
          {results && (
            <p className="text-muted-foreground">
              {results.totalCount} 件の記事が見つかりました
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* フィルターサイドバー */}
          <aside className="lg:col-span-1">
            {results && (
              <SearchFilters
                facets={results.facets}
                selectedTags={selectedTags}
                selectedSources={selectedSources}
                selectedDifficulty={selectedDifficulty}
              />
            )}
          </aside>

          {/* 検索結果 */}
          <main className="lg:col-span-3">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-red-500">{error}</p>
              </div>
            ) : results && results.articles.length > 0 ? (
              <SearchResults
                articles={results.articles}
                totalCount={results.totalCount}
                page={page}
                onPageChange={setPage}
              />
            ) : (
              <div className="text-center py-12">
                <p className="text-lg text-muted-foreground mb-4">
                  {query || hasFilters
                    ? '検索条件に一致する記事が見つかりませんでした'
                    : '検索キーワードを入力してください'}
                </p>
                {(query || hasFilters) && (
                  <p className="text-sm text-muted-foreground">
                    別のキーワードや条件で検索してみてください
                  </p>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}