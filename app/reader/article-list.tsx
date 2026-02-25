'use client';

import { ArticleListItem } from './article-list-item';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Newspaper,
} from 'lucide-react';
import type { ReaderListArticle } from './types';

interface ArticleListProps {
  articles: ReaderListArticle[];
  selectedId: string | null;
  isLoading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  onSelectArticle: (id: string) => void;
  onPageChange: (page: number) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onRetry: () => void;
}

export function ReaderArticleList({
  articles,
  selectedId,
  isLoading,
  error,
  page,
  totalPages,
  onSelectArticle,
  onPageChange,
  onKeyDown,
  onRetry,
}: ArticleListProps) {
  if (error && articles.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <AlertCircle className="text-destructive h-8 w-8" />
        <p className="text-muted-foreground text-sm">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="text-primary hover:text-primary/80 cursor-pointer text-sm"
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (isLoading && articles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin motion-reduce:animate-none" />
      </div>
    );
  }

  if (!isLoading && !error && articles.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <Newspaper className="text-muted-foreground h-8 w-8 opacity-50" />
        <p className="text-muted-foreground text-sm">記事がありません</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Combined header bar with pagination */}
      <div className="border-border bg-muted/70 flex shrink-0 items-center justify-between border-b px-3 py-1.5">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          記事一覧
        </h2>
        <div className="text-muted-foreground flex items-center gap-1 text-xs">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="前のページ"
            className="hover:bg-muted cursor-pointer rounded p-0.5 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span aria-live="polite" aria-atomic="true">
            {page}/{totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="次のページ"
            className="hover:bg-muted cursor-pointer rounded p-0.5 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      {/* Article list - takes full remaining height */}
      <div
        className="flex-1 overflow-y-auto"
        role="listbox"
        aria-label="記事一覧"
        onKeyDown={onKeyDown}
      >
        {articles.map((article) => (
          <ArticleListItem
            key={article.id}
            article={article}
            isSelected={article.id === selectedId}
            onSelect={onSelectArticle}
          />
        ))}
      </div>
    </div>
  );
}
