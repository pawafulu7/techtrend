'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Calendar, Download, Clock, ExternalLink } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { formatDateWithTime } from '@/lib/utils/date';
import { getSourceColor } from '@/lib/utils/source/source-colors';
import type { ArticleCardProps } from '@/types/components';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/app/components/article/favorite-button';
import { useIsNewArticle } from '@/app/components/common/relative-time';

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

  // Note: Use hook to avoid Date.now() during render (React Compiler purity rule)
  const isNew = useIsNewArticle(article.publishedAt, 24) ?? false;
  const sourceColor = article.source
    ? getSourceColor(article.source.name)
    : null;

  // Reading time calculation (~500 chars/min for Japanese content)
  const contentLength = article.contentLength ?? article.content?.length ?? 0;
  const readingTime =
    contentLength > 0 ? Math.max(1, Math.ceil(contentLength / 500)) : null;

  const navigateToArticle = () => {
    if (onArticleClick) {
      onArticleClick(article.id);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('returning', '1');
    const returnUrl = `/?${params.toString()}`;
    const articleUrl = `/articles/${article.id}?from=${encodeURIComponent(returnUrl)}`;
    router.push(articleUrl);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Ignore clicks on buttons or interactive elements
    if ((e.target as HTMLElement).closest('button, [role="button"]')) {
      return;
    }
    navigateToArticle();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigateToArticle();
    }
  };

  const handleTagNavigation = (tagName: string) => {
    if (onTagClick) {
      onTagClick(tagName);
    } else {
      router.push(`/?tags=${encodeURIComponent(tagName)}&tagMode=OR`);
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
      <div className="flex min-w-0 items-center gap-1">
        <BadgeV2
          variant="outline"
          tabIndex={0}
          role="button"
          className="max-w-[120px] cursor-pointer truncate text-xs"
          onClick={(e) => {
            e.stopPropagation();
            handleTagNavigation(firstTag.name);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              handleTagNavigation(firstTag.name);
            }
          }}
        >
          {firstTag.name}
        </BadgeV2>
        {remainingCount > 0 && (
          <span className="text-muted-foreground shrink-0 text-xs">
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
        'group relative flex min-h-[140px] cursor-pointer flex-col gap-1 p-3',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        isNew
          ? 'border-t-2 border-t-green-500/60 dark:border-t-green-400/40'
          : sourceColor?.borderLeft
      )}
    >
      {/* Badges Row */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {isNew && (
          <span
            className="relative flex h-2.5 w-2.5 shrink-0"
            aria-label="24時間以内の新着記事"
            title="NEW"
            role="img"
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>
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
              'flex items-center gap-1 text-xs',
              sourceColor.tag,
              sourceColor.border
            )}
            data-testid="article-source"
          >
            <span
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                sourceColor.dot
              )}
              aria-hidden="true"
            />
            {article.companyName ?? article.source.name}
          </BadgeV2>
        )}
      </div>

      {/* Timestamps Row */}
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[10px]">
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
          'font-heading text-foreground line-clamp-2 text-base leading-snug font-semibold',
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
          className="h-9 min-h-[36px] min-w-[36px] px-3"
        />
        <div className="flex items-center gap-2">
          {readingTime && contentLength > 0 && (
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <Clock className="h-3 w-3" aria-hidden="true" />
              <span>
                {readingTime}分 / {contentLength.toLocaleString('ja-JP')}字
              </span>
            </span>
          )}
          <ButtonV2
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              window.open(article.url, '_blank', 'noopener,noreferrer');
            }}
            className="h-9 min-h-[36px] min-w-[36px] px-3 text-xs"
            title="元記事を開く"
            aria-label="元記事を新しいタブで開く"
          >
            <ExternalLink className="mr-1 h-4 w-4" />
            元記事
          </ButtonV2>
        </div>
      </div>
    </CardV2>
  );
}
