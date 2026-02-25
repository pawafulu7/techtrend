'use client';

import { useState } from 'react';
import { Newspaper } from 'lucide-react';
import { RelativeTime } from '@/app/components/common/relative-time';

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

  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={() => onSelect(article.id)}
      className={`border-border flex w-full cursor-pointer items-start gap-3 border-b p-3 text-left transition-colors duration-150 motion-reduce:transition-none ${
        isSelected
          ? 'bg-accent border-l-primary border-l-2'
          : 'hover:bg-muted/50 border-l-2 border-l-transparent'
      }`}
    >
      <div className="bg-muted flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded">
        {showThumbnail ? (
          <img
            src={article.thumbnail!}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setThumbnailError(true)}
          />
        ) : (
          <Newspaper className="text-muted-foreground h-5 w-5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-foreground line-clamp-2 text-sm leading-snug font-medium">
          {displayTitle}
        </h3>
        <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
          {article.source?.name && (
            <span className="max-w-[120px] truncate">
              {article.source.name}
            </span>
          )}
          <span className="shrink-0">
            <RelativeTime date={article.publishedAt} />
          </span>
        </div>
      </div>
    </button>
  );
}
