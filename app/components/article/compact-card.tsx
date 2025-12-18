'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Calendar, Download, Clock, ExternalLink } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { formatDateWithTime } from '@/lib/utils/date';
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
 * - Published/Created timestamps
 * - Title (2 lines max)
 * - Single tag + count
 * - Reading time / character count
 * - External link button
 * - Favorite button
 *
 * Hidden (compared to ArticleCard):
 * - Summary text
 * - Thumbnail
 * - Vote button
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

  // Reading time calculation (~500 chars/min for Japanese content)
  const contentLength = article.contentLength ?? article.content?.length ?? 0;
  const readingTime = contentLength > 0 ? Math.max(1, Math.ceil(contentLength / 500)) : null;

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
        'group relative flex flex-col gap-1 p-3 cursor-pointer min-h-[140px]',
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
            未読
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

      {/* Timestamps Row */}
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-0.5" title="Published date">
          <Calendar className="h-3 w-3" aria-hidden="true" />
          <span>{formatDateWithTime(article.publishedAt)}</span>
        </span>
        <span className="flex items-center gap-0.5" title="Fetched date">
          <Download className="h-3 w-3" aria-hidden="true" />
          <span>{formatDateWithTime(article.createdAt)}</span>
        </span>
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

      {/* Tags */}
      {renderTags()}

      {/* Footer: ArticleCardと同じ構造 - 左=FavoriteButton、右=読了時間+元記事ボタン */}
      <div className="mt-auto flex items-center justify-between pt-1">
        <FavoriteButton
          articleId={article.id}
          isFavorited={isFavorited}
          onToggleFavorite={onToggleFavorite}
          className="h-9 px-3 min-w-[36px] min-h-[36px]"
        />
        <div className="flex items-center gap-2">
          {readingTime && contentLength > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              <span>{readingTime}分 / {contentLength.toLocaleString('ja-JP')}字</span>
            </span>
          )}
          <ButtonV2
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              window.open(article.url, '_blank', 'noopener,noreferrer');
            }}
            className="h-9 px-3 text-xs min-w-[36px] min-h-[36px]"
            title="元記事を開く"
            aria-label="元記事を新しいタブで開く"
          >
            <ExternalLink className="h-4 w-4 mr-1" />
            元記事
          </ButtonV2>
        </div>
      </div>
    </CardV2>
  );
}
