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
  const [thumbnailError, setThumbnailError] = useState(false);
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
      className={`mx-2 mb-2 cursor-pointer overflow-hidden rounded-xl ring-1 transition-all duration-150 motion-reduce:transition-none ${
        isSelected
          ? 'bg-lime-50/40 shadow-sm ring-lime-400 dark:bg-lime-900/10 dark:ring-lime-500'
          : 'bg-white ring-slate-200 hover:shadow-sm hover:ring-slate-300 dark:bg-slate-800/50 dark:ring-slate-700 dark:hover:ring-slate-600'
      }`}
    >
      <div
        className="relative w-full overflow-hidden bg-slate-100 dark:bg-slate-800"
        style={{ paddingBottom: '60%' }}
      >
        {showThumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- Custom image loader handles 800+ domains; see next.config.ts
          <img
            src={article.thumbnail!}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
            loading="lazy"
            onError={() => setThumbnailError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Newspaper className="h-10 w-10 text-slate-300 dark:text-slate-600" />
          </div>
        )}
      </div>
      <div className="px-3 py-2">
        <h3 className="line-clamp-2 text-[13px] leading-snug font-medium text-slate-800 dark:text-slate-100">
          {displayTitle}
        </h3>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
          {article.source?.name && (
            <span className="max-w-[160px] truncate font-medium text-lime-600 dark:text-lime-400">
              {article.source.name}
            </span>
          )}
          {dateStr && <span className="shrink-0">{dateStr}</span>}
        </div>
      </div>
    </div>
  );
}
