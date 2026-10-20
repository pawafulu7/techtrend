'use client';

import { useEffect, useRef } from 'react';
import { ArticleListItem, readerOptionId } from './article-list-item';
import { Loader2, AlertCircle, Newspaper } from 'lucide-react';
import type { ReaderListArticle } from './types';
import { cn } from '@/lib/utils';

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
  /** listbox の要素。一覧に戻ったときに reader-client がフォーカスを戻す */
  listboxRef?: React.Ref<HTMLDivElement>;
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
  listboxRef,
}: ArticleListProps) {
  if (error && articles.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <AlertCircle className="text-destructive h-8 w-8" />
        <p className="text-muted-foreground text-sm">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="text-primary hover:text-tt-primary-hover cursor-pointer text-sm"
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
        listboxRef={listboxRef}
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
  listboxRef,
}: {
  articles: ReaderListArticle[];
  selectedId: string | null;
  onSelectArticle: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  listboxRef?: React.Ref<HTMLDivElement>;
}) {
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 選んでいる行を見える位置へ。すでに見えていれば動かさない（nearest）
  useEffect(() => {
    if (!selectedId) return;
    const el = itemRefs.current.get(selectedId);
    if (el) {
      const prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;
      el.scrollIntoView({
        block: 'nearest',
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }
  }, [selectedId]);

  // 深いリンクで開いた記事が一覧に無いときは、listbox の選んでいる項目を無しにする
  const activeDescendant =
    selectedId && articles.some((article) => article.id === selectedId)
      ? readerOptionId(selectedId)
      : undefined;

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
    // フォーカスは listbox に置いたまま、選んでいる行を aria-activedescendant で示す。行ごとに .focus() で
    // 動かすと、本文の「前の記事」「次の記事」で選択が変わったときに本文からフォーカスを奪うため。
    // Tab で止まるのはこの1か所
    <div
      ref={listboxRef}
      // 選んでいる行があれば輪はその行に出す（article-list-item.tsx）。無いときは一覧の枠に出す
      className={cn(
        'group/listbox flex-1 overflow-y-auto focus-visible:outline-none',
        !activeDescendant &&
          'focus-visible:ring-2 focus-visible:ring-(--tt-color-primary) focus-visible:ring-inset'
      )}
      role="listbox"
      tabIndex={0}
      aria-label="記事一覧"
      aria-activedescendant={activeDescendant}
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
