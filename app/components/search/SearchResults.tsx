'use client';

import { ArticleCard } from '@/app/components/article/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ArticleWithRelations } from '@/types/models';

interface SearchResultsProps {
  articles: ArticleWithRelations[];
  totalCount: number;
  page: number;
  onPageChange: (page: number) => void;
}

export function SearchResults({
  articles,
  totalCount,
  page,
  onPageChange,
}: SearchResultsProps) {
  const limit = 20;
  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="space-y-6">
      {/* 記事グリッド */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            前へ
          </Button>

          <div className="flex items-center gap-1">
            {/* 最初のページ */}
            {page > 3 && (
              <>
                <Button
                  variant={page === 1 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onPageChange(1)}
                >
                  1
                </Button>
                {page > 4 && <span className="text-muted-foreground">...</span>}
              </>
            )}

            {/* 現在のページ周辺 */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(page - 2 + i, totalPages - 4)) + i;
              if (pageNum > 0 && pageNum <= totalPages) {
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onPageChange(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              }
              return null;
            }).filter(Boolean)}

            {/* 最後のページ */}
            {page < totalPages - 2 && (
              <>
                {page < totalPages - 3 && <span className="text-muted-foreground">...</span>}
                <Button
                  variant={page === totalPages ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onPageChange(totalPages)}
                >
                  {totalPages}
                </Button>
              </>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            次へ
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* ページ情報 */}
      <div className="text-center text-sm text-muted-foreground">
        {totalCount} 件中 {(page - 1) * limit + 1} - {Math.min(page * limit, totalCount)} 件を表示
      </div>
    </div>
  );
}