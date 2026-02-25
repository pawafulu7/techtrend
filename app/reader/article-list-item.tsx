'use client';

import { useState } from 'react';
import { Newspaper } from 'lucide-react';

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

function formatShortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${h}:${m}`;
  } catch {
    return '';
  }
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
  const dateStr = formatShortDate(article.publishedAt);

  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={() => onSelect(article.id)}
      className={`flex w-full cursor-pointer items-start gap-3 border-b border-slate-100 px-3 py-3.5 text-left transition-colors duration-150 motion-reduce:transition-none dark:border-slate-800 ${
        isSelected
          ? 'border-l-[3px] border-l-teal-400 bg-teal-50/50 dark:bg-teal-900/20'
          : 'border-l-[3px] border-l-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
      }`}
    >
      <div className="flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
        {showThumbnail ? (
          <img
            src={article.thumbnail!}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setThumbnailError(true)}
          />
        ) : (
          <Newspaper className="h-7 w-7 text-slate-300 dark:text-slate-600" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-sm leading-snug font-medium text-slate-800 dark:text-slate-100">
          {displayTitle}
        </h3>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
          {article.source?.name && (
            <span className="max-w-[120px] truncate font-medium text-teal-600 dark:text-teal-400">
              {article.source.name}
            </span>
          )}
          {dateStr && <span className="shrink-0">{dateStr}</span>}
        </div>
      </div>
    </button>
  );
}
