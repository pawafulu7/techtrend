'use client';

import { useState } from 'react';
import { hasValidThumbnail } from '@/lib/utils/article/thumbnail';
import { cn } from '@/lib/utils';
import { formatDate } from './utils';
import { OptimizedImage } from '@/app/components/common/optimized-image';
import { TranslationBadge } from '@/components/ui/translation-badge';

/** 一覧の項目の id。listbox の aria-activedescendant が指す */
export function readerOptionId(articleId: string): string {
  return `reader-article-${articleId}`;
}

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

/**
 * リーダーの一覧の1行。タイトル 2 行・ソース・日時と、右に小さな画像（あれば）。
 * フォーカスは listbox に置いたまま aria-activedescendant でこの行を指すので、行自体はフォーカスを受けない。
 * 選んでいる行は、listbox にキーボードのフォーカスがあるときだけ輪で示す（article-list.tsx の group/listbox）
 */
export function ArticleListItem({
  article,
  isSelected,
  onSelect,
}: ArticleListItemProps) {
  const [erroredThumbnail, setErroredThumbnail] = useState<string | null>(null);
  const thumbnailError =
    erroredThumbnail !== null && erroredThumbnail === article.thumbnail;
  const displayTitle = article.translatedTitle || article.title;
  const thumbnailSrc =
    hasValidThumbnail(article.thumbnail) && !thumbnailError
      ? article.thumbnail
      : null;
  const dateStr = formatDate(article.publishedAt);

  return (
    <div
      id={readerOptionId(article.id)}
      role="option"
      aria-selected={isSelected}
      onClick={() => onSelect(article.id)}
      className={cn(
        'relative flex cursor-pointer gap-3 border-b border-(--tt-color-border) px-4 py-3 transition-colors duration-150 motion-reduce:transition-none',
        // 選んでいる行は藍の淡い面と、左の 2px の藍の線
        "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:content-['']",
        isSelected
          ? 'bg-(--tt-color-primary-bg) group-focus-visible/listbox:ring-2 group-focus-visible/listbox:ring-(--tt-color-primary) group-focus-visible/listbox:ring-inset before:bg-(--tt-color-primary)'
          : 'before:bg-transparent hover:bg-(--tt-color-surface-hover)'
      )}
    >
      <div className="min-w-0 flex-1">
        {/* listbox の項目の中身は読み上げで1つの名前にまとまるので、見出しにはしない */}
        <p className="line-clamp-2 text-[15px] leading-snug font-semibold text-(--tt-color-text)">
          {displayTitle}
        </p>
        {/* 狭い一覧の列では日付を次の行へ送る。バッジはソース名から離さない */}
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-(--tt-color-text-muted)">
          {(article.source?.name || article.translatedTitle) && (
            <span className="flex min-w-0 items-center gap-2">
              {article.source?.name && (
                <span
                  className="max-w-[160px] min-w-0 truncate font-medium"
                  title={article.source.name}
                >
                  {article.source.name}
                </span>
              )}
              {article.translatedTitle && <TranslationBadge compact />}
            </span>
          )}
          {dateStr && <span className="shrink-0 tabular-nums">{dateStr}</span>}
        </div>
      </div>
      {thumbnailSrc && (
        <div className="relative h-12 w-[72px] shrink-0 overflow-hidden rounded-sm bg-(--tt-color-surface-muted)">
          <OptimizedImage
            src={thumbnailSrc}
            alt=""
            fill
            sizes="72px"
            className="object-cover"
            onError={() => setErroredThumbnail(thumbnailSrc)}
          />
        </div>
      )}
    </div>
  );
}
