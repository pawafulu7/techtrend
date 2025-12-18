'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { getSourceColor } from '@/lib/utils/source-colors';
import type { ArticleCardProps } from '@/types/components';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/app/components/article/favorite-button';

/**
 * CompactCard - Title-only card for increased article density
 *
 * Displays:
 * - NEW badge (if < 24h)
 * - Unread badge
 * - Source badge with color
 * - Title (2 lines max)
 * - Single tag + count
 * - Favorite button
 *
 * Hidden (compared to ArticleCard):
 * - Summary text
 * - Thumbnail
 * - Reading time / character count
 * - External link button
 * - Vote button
 * - Timestamps
 * - Share button
 */
export function CompactCard({
  article,
  onArticleClick,
  isRead: initialIsRead = false,
  isFavorited,
  onToggleFavorite,
  showSource = true,
  showTags = true,
  onTagClick,
}: ArticleCardProps & { isRead?: boolean }) {
  const [isRead, setIsRead] = useState(initialIsRead);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Listen for read status changes
  useEffect(() => {
    const handleReadStatusChange = (event: CustomEvent) => {
      if (event.detail.articleId === article.id) {
        setIsRead(event.detail.isRead);
      }
    };

    window.addEventListener('article-read-status-changed', handleReadStatusChange as EventListener);
    return () => {
      window.removeEventListener('article-read-status-changed', handleReadStatusChange as EventListener);
    };
  }, [article.id]);

  // Update isRead when prop changes
  useEffect(() => {
    setIsRead(initialIsRead);
  }, [initialIsRead]);

  const publishedDate = new Date(article.publishedAt);
  const hoursAgo = Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
  const isNew = hoursAgo < 24;
  const sourceColor = article.source ? getSourceColor(article.source.name) : null;

  const handleCardClick = (e: React.MouseEvent) => {
    // Ignore clicks on buttons or interactive elements
    if ((e.target as HTMLElement).closest('button, [role="button"]')) {
      return;
    }
    if (onArticleClick) {
      onArticleClick(article.id);
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete('returning');
    params.set('returning', '1');

    const returnUrl = `/?${params.toString()}`;
    const articleUrl = `/articles/${article.id}?from=${encodeURIComponent(returnUrl)}`;
    router.push(articleUrl);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onArticleClick) {
        onArticleClick(article.id);
      }
      const params = new URLSearchParams(searchParams.toString());
      params.delete('returning');
      params.set('returning', '1');
      const returnUrl = `/?${params.toString()}`;
      const articleUrl = `/articles/${article.id}?from=${encodeURIComponent(returnUrl)}`;
      router.push(articleUrl);
    }
  };

  // Render single tag + remaining count
  const renderTags = () => {
    if (!showTags || !article.tags || article.tags.length === 0) {
      return null;
    }

    const firstTag = article.tags[0];
    const remainingCount = article.tags.length - 1;

    return (
      <div className="flex items-center gap-1 min-w-0">
        <BadgeV2
          variant="outline"
          tabIndex={0}
          role="button"
          className="text-xs cursor-pointer truncate max-w-[120px]"
          onClick={(e) => {
            e.stopPropagation();
            if (onTagClick) {
              onTagClick(firstTag.name);
            } else {
              router.push(`/?tags=${encodeURIComponent(firstTag.name)}&tagMode=OR`);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              if (onTagClick) {
                onTagClick(firstTag.name);
              } else {
                router.push(`/?tags=${encodeURIComponent(firstTag.name)}&tagMode=OR`);
              }
            }
          }}
        >
          {firstTag.name}
        </BadgeV2>
        {remainingCount > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">
            +{remainingCount}
          </span>
        )}
      </div>
    );
  };

  return (
    <CardV2
      variant="hover"
      tabIndex={0}
      role="article"
      aria-labelledby={`compact-title-${article.id}`}
      id={`article-${article.id}`}
      data-testid="compact-card"
      data-article-id={article.id}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative flex flex-col gap-2 p-3 cursor-pointer min-h-[140px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        sourceColor?.borderLeft
      )}
    >
      {/* Badges Row */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {isNew && (
          <BadgeV2
            variant="primary"
            className="text-xs shadow-[0_0_12px_rgba(22,163,74,0.4)] dark:shadow-[0_0_12px_rgba(34,197,94,0.4)]"
            aria-label="24 hours or newer"
          >
            NEW
          </BadgeV2>
        )}
        {!isRead && (
          <BadgeV2
            variant="secondary"
            className="text-xs"
            data-testid="unread-badge"
          >
            unread
          </BadgeV2>
        )}
        {showSource && article.source && sourceColor && (
          <BadgeV2
            variant="outline"
            className={cn(
              "text-xs flex items-center gap-1",
              sourceColor.tag,
              sourceColor.border
            )}
            data-testid="article-source"
          >
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", sourceColor.dot)} aria-hidden="true" />
            {article.companyName ?? article.source.name}
          </BadgeV2>
        )}
      </div>

      {/* Title */}
      <h3
        id={`compact-title-${article.id}`}
        title={article.translatedTitle || article.title}
        className={cn(
          'font-heading text-base font-semibold leading-snug text-foreground line-clamp-2',
          isRead && 'opacity-70'
        )}
      >
        {article.translatedTitle || article.title}
      </h3>

      {/* Footer: Tags + Favorite */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        {renderTags()}

        <FavoriteButton
          articleId={article.id}
          isFavorited={isFavorited}
          onToggleFavorite={onToggleFavorite}
          className="h-11 w-11 min-w-[44px] min-h-[44px] shrink-0"
        />
      </div>
    </CardV2>
  );
}
