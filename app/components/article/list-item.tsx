'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Clock, TrendingUp, ExternalLink, Eye } from 'lucide-react';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { formatDate, formatDateWithTime } from '@/lib/utils/date';
import { getSourceColor } from '@/lib/utils/source-colors';
import type { ArticleListItemProps } from '@/types/components';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/app/components/article/favorite-button';
import { useIsNewArticle } from '@/app/components/common/relative-time';
export function ArticleListItem({
  article,
  onTagClick,
  onArticleClick,
  isRead: initialIsRead = true,
  isFavorited = false,
  onToggleFavorite,
}: ArticleListItemProps) {
  const [isRead, setIsRead] = useState(initialIsRead);
  const router = useRouter();

  // Listen for read status changes
  useEffect(() => {
    const handleReadStatusChange = (event: CustomEvent) => {
      if (event.detail.articleId === article.id) {
        setIsRead(event.detail.isRead);
      }
    };

    window.addEventListener(
      'article-read-status-changed',
      handleReadStatusChange as EventListener
    );

    return () => {
      window.removeEventListener(
        'article-read-status-changed',
        handleReadStatusChange as EventListener
      );
    };
  }, [article.id]);

  // Update isRead when prop changes
  useEffect(() => {
    setIsRead(initialIsRead);
  }, [initialIsRead]);

  // Note: Use hook and state to avoid Date.now() during render (React Compiler purity rule)
  const isNew = useIsNewArticle(article.publishedAt, 24) ?? false;
  const [hoursAgo, setHoursAgo] = useState<number | null>(null);
  useEffect(() => {
    const publishedDate = new Date(article.publishedAt);
    setHoursAgo(
      Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60))
    );
  }, [article.publishedAt]);

  const searchParams = useSearchParams();
  const sourceColor = getSourceColor(article.source?.name || 'Unknown');

  const handleClick = useCallback(
    (_e: React.MouseEvent | React.KeyboardEvent) => {
      if (onArticleClick) {
        onArticleClick(article.id);
      }

      const params = new URLSearchParams(searchParams.toString());
      params.delete('returning');
      params.set('returning', '1');

      const returnUrl = `/?${params.toString()}`;
      const articleUrl = `/articles/${article.id}?from=${encodeURIComponent(returnUrl)}`;

      router.push(articleUrl);
    },
    [article.id, onArticleClick, searchParams, router]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        handleClick(e);
      }
    },
    [handleClick]
  );

  return (
    <div
      id={`article-${article.id}`}
      data-article-id={article.id}
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={article.translatedTitle || article.title}
      className={cn(
        'group flex cursor-pointer items-center justify-between gap-4 rounded-lg p-3',
        'bg-(--tt-color-surface)',
        'transition-all duration-200',
        'hover:bg-(--tt-color-surface-hover)',
        'border border-(--tt-color-border)',
        'hover:border-(--tt-color-border-hover)',
        'hover:shadow-sm',
        'focus-visible:ring-2 focus-visible:ring-(--tt-color-primary) focus-visible:outline-none',
        sourceColor.hover
      )}
    >
      {/* Left: title and tags */}
      <div className="min-w-0 flex-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isNew && (
              <BadgeV2 className="flex-shrink-0 text-xs" variant="positive">
                <TrendingUp className="mr-0.5 h-3 w-3" />
                New
              </BadgeV2>
            )}
            {!isRead && (
              <BadgeV2 className="flex-shrink-0 text-xs" variant="info">
                <Eye className="mr-0.5 h-3 w-3" />
                未読
              </BadgeV2>
            )}
            <h3
              className="text-foreground line-clamp-1 text-sm font-medium group-hover:text-(--tt-color-primary)"
              title={article.translatedTitle || article.title}
            >
              {article.translatedTitle || article.title}
            </h3>
          </div>
          {article.summary && (
            <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
              {article.summary}
            </p>
          )}
        </div>

        {article.tags && article.tags.length > 0 && (
          <div className="mt-1 hidden flex-wrap gap-1 sm:flex">
            {article.tags.slice(0, 3).map((tag) => (
              <BadgeV2
                key={tag.id}
                variant="outline"
                className="h-5 cursor-pointer px-1.5 py-0 text-xs"
                asChild
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onTagClick) {
                      onTagClick(tag.name);
                    } else {
                      router.push(
                        `/?tags=${encodeURIComponent(tag.name)}&tagMode=OR`
                      );
                    }
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {tag.name}
                </button>
              </BadgeV2>
            ))}
          </div>
        )}
      </div>

      {/* Right: meta info and actions */}
      <div className="flex flex-shrink-0 items-center gap-2">
        <BadgeV2
          variant="secondary"
          className={cn('text-xs font-medium', sourceColor.tag)}
        >
          {article.source?.name || 'Unknown'}
        </BadgeV2>

        <div className="text-muted-foreground flex flex-col gap-0.5 text-xs">
          <div className="hidden flex-col gap-0.5 sm:flex">
            <span className="flex items-center gap-1">
              <span>📅</span>
              <span>{formatDateWithTime(article.publishedAt)}</span>
            </span>
            <span className="flex items-center gap-1">
              <span>📥</span>
              <span>{formatDateWithTime(article.createdAt)}</span>
            </span>
          </div>
          <span className="flex items-center gap-1 sm:hidden">
            <Clock className="h-3 w-3" />
            {hoursAgo !== null && hoursAgo < 24
              ? `${hoursAgo}h`
              : formatDate(article.publishedAt)}
          </span>
        </div>

        <div className="hidden items-center gap-1 group-hover:flex">
          <FavoriteButton
            articleId={article.id}
            compact
            isFavorited={isFavorited}
            onToggleFavorite={onToggleFavorite}
            className="h-11 min-h-[44px] w-11 min-w-[44px]"
          />
          <ButtonV2
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              window.open(article.url, '_blank', 'noopener,noreferrer');
            }}
            className="h-11 min-h-[44px] w-11 min-w-[44px] p-0"
            title="元記事を開く"
          >
            <ExternalLink className="h-3 w-3" />
          </ButtonV2>
        </div>
      </div>
    </div>
  );
}
