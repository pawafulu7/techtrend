'use client';

import { useEffect, useRef } from 'react';
import { ArticleListItem } from './article-list-item';
import { Loader2, AlertCircle, Newspaper } from 'lucide-react';
import type { ReaderListArticle } from './types';

interface ArticleListProps {
  articles: ReaderListArticle[];
  selectedId: string | null;
  isLoading: boolean;
  error: string | null;
  onSelectArticle: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onRetry: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

export function ReaderArticleList({
  articles,
  selectedId,
  isLoading,
  error,
  onSelectArticle,
  onKeyDown,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
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
      <ScrollableArticleList
        articles={articles}
        selectedId={selectedId}
        onSelectArticle={onSelectArticle}
        onKeyDown={onKeyDown}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={onLoadMore}
      />
    </div>
  );
}

function ScrollableArticleList({
  articles,
  selectedId,
  onSelectArticle,
  onKeyDown,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  articles: ReaderListArticle[];
  selectedId: string | null;
  onSelectArticle: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (!selectedId) return;
    const el = itemRefs.current.get(selectedId);
    if (el) {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [selectedId]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          onLoadMore();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  return (
    <div
      className="flex-1 overflow-y-auto"
      role="listbox"
      aria-label="記事一覧"
      onKeyDown={onKeyDown}
    >
      {articles.map((article) => (
        <div
          key={article.id}
          ref={(el) => {
            if (el) {
              itemRefs.current.set(article.id, el);
            } else {
              itemRefs.current.delete(article.id);
            }
          }}
        >
          <ArticleListItem
            article={article}
            isSelected={article.id === selectedId}
            onSelect={onSelectArticle}
          />
        </div>
      ))}
      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-1" />
      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Loader2 className="text-muted-foreground h-5 w-5 animate-spin motion-reduce:animate-none" />
        </div>
      )}
    </div>
  );
}
