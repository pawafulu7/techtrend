'use client';

import { useState } from 'react';
import { Newspaper } from 'lucide-react';
import { formatDate } from './utils';

interface ArticleListItemProps {
  article: {
    id: string;
    title: string;
    translatedTitle: string | null;
    thumbnail: string | null;
    publishedAt: string;
    source: { name: string } | null;
  };
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export function ArticleListItem({
  article,
  isSelected,
  onSelect,
}: ArticleListItemProps) {
  const [erroredThumbnail, setErroredThumbnail] = useState<string | null>(null);
  const thumbnailError = erroredThumbnail === article.thumbnail;
  const displayTitle = article.translatedTitle || article.title;
  const hasValidThumbnail =
    !!article.thumbnail && /^https?:\/\//.test(article.thumbnail);
  const showThumbnail = hasValidThumbnail && !thumbnailError;
  const dateStr = formatDate(article.publishedAt);

  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={() => onSelect(article.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(article.id);
        }
      }}
      tabIndex={isSelected ? 0 : -1}
      className={`mx-2 mb-2 cursor-pointer overflow-hidden rounded-xl ring-1 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-[var(--tt-color-info)] focus-visible:outline-none motion-reduce:transition-none ${
        isSelected
          ? 'bg-[var(--tt-color-positive-bg)] shadow-sm ring-[var(--tt-color-positive-border)]'
          : 'bg-[var(--tt-color-surface)] ring-[var(--tt-color-border)] hover:shadow-sm hover:ring-[var(--tt-color-border-hover)]'
      }`}
    >
      <div
        className="relative w-full overflow-hidden bg-[var(--tt-color-surface-muted)]"
        style={{ paddingBottom: '60%' }}
      >
        {showThumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- Custom image loader handles 800+ domains; see next.config.ts
          <img
            src={article.thumbnail!}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
            loading="lazy"
            onError={() => setErroredThumbnail(article.thumbnail)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Newspaper className="h-10 w-10 text-[var(--tt-color-text-muted)]" />
          </div>
        )}
      </div>
      <div className="px-3 py-2">
        <h3 className="line-clamp-2 text-[13px] leading-snug font-medium text-[var(--tt-color-text)]">
          {displayTitle}
        </h3>
        <div className="mt-1 flex items-center gap-2 text-xs text-[var(--tt-color-text-muted)]">
          {article.source?.name && (
            <span className="max-w-[160px] truncate font-medium text-[var(--tt-color-positive)]">
              {article.source.name}
            </span>
          )}
          {dateStr && <span className="shrink-0">{dateStr}</span>}
        </div>
      </div>
    </div>
  );
}
