'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Calendar, ExternalLink } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { getSourceColor } from '@/lib/utils/source-colors';
import type { ArticleCardProps } from '@/types/components';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/app/components/article/favorite-button';
import { OptimizedImage } from '@/app/components/common/optimized-image';
import { useIsNewArticle } from '@/app/components/common/relative-time';
import { formatDateWithTime } from '@/lib/utils/date';

export function ArticleCard({
  article,
  onArticleClick,
  isRead: initialIsRead = false,
  isFavorited,
  onToggleFavorite,
  showSource = true,
}: ArticleCardProps & { isRead?: boolean }) {
  const [isRead, setIsRead] = useState(initialIsRead);
  const router = useRouter();

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

  useEffect(() => {
    setIsRead(initialIsRead);
  }, [initialIsRead]);

  // T1: Thumbnail display with validation and error fallback
  const [thumbnailError, setThumbnailError] = useState(false);
  const hasValidThumbnailUrl =
    !!article.thumbnail && /^https?:\/\//.test(article.thumbnail);
  const showThumbnail = hasValidThumbnailUrl && !thumbnailError;
  const trimmedSummary = article.summary?.trim() || '';

  const searchParams = useSearchParams();
  const isNew = useIsNewArticle(article.publishedAt, 24) ?? false;
  const sourceColor = article.source
    ? getSourceColor(article.source.name)
    : null;

  const handleCardClick = (e: React.MouseEvent) => {
    if (
      e.defaultPrevented ||
      (e.target as HTMLElement).closest('button, a, [role="button"]')
    ) {
      return;
    }
    if (onArticleClick) {
      onArticleClick(article.id);
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set('returning', '1');

    const returnUrl = `/?${params.toString()}`;
    const articleUrl = `/articles/${article.id}?from=${encodeURIComponent(returnUrl)}`;
    router.push(articleUrl);
  };

  const votes = article.userVotes || 0;

  // Thumbnail displayed at card top for all patterns with valid thumbnail
  const hasTopThumbnail = showThumbnail;

  return (
    <CardV2
      variant="hover"
      id={`article-${article.id}`}
      data-testid="article-card"
      data-article-id={article.id}
      onClick={handleCardClick}
      className={cn(
        'group relative flex h-auto cursor-pointer flex-col sm:min-h-[240px]',
        hasTopThumbnail ? 'gap-0 pb-4' : 'gap-1.5 px-4 pt-3 pb-4',
        isNew
          ? 'border-t-2 border-t-green-500/60 dark:border-t-green-400/40'
          : sourceColor?.borderLeft
      )}
    >
      {/* Top thumbnail: both presentation and standard patterns */}
      {hasTopThumbnail && (
        <div
          className={cn(
            'relative isolate w-full overflow-hidden rounded-t-lg bg-gray-100 dark:bg-gray-800',
            'min-h-[160px]'
          )}
        >
          <OptimizedImage
            src={article.thumbnail!}
            alt={article.title}
            fill
            priority={false}
            className={cn(
              'transition-transform duration-300 ease-out group-hover:scale-[1.01]',
              'object-contain'
            )}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            onError={() => setThumbnailError(true)}
          />
        </div>
      )}

      {/* Content area: padded for Pattern 2, inline for others */}
      <div
        className={cn('flex flex-col gap-1.5', hasTopThumbnail && 'px-4 pt-2')}
      >
        {/* Title - always displayed */}
        <h3
          className={cn(
            'font-heading text-foreground line-clamp-2 text-base leading-snug font-semibold sm:text-lg',
            isRead && 'opacity-70'
          )}
          title={article.translatedTitle || article.title}
        >
          {article.translatedTitle || article.title}
        </h3>

        {/* Sub-line: badges + relative time */}
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
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
                'flex items-center gap-1.5 text-xs',
                sourceColor.tag,
                sourceColor.border,
                sourceColor.hover
              )}
              data-testid="article-source"
            >
              <span
                className={cn('h-2 w-2 shrink-0 rounded-full', sourceColor.dot)}
                aria-hidden="true"
              />
              {article.companyName ?? article.source.name}
            </BadgeV2>
          )}
          <span className="text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">公開日:</span>
            <span>{formatDateWithTime(article.publishedAt)}</span>
          </span>
        </div>

        {/* Content area: 2 patterns */}
        {showThumbnail ? (
          // Pattern with thumbnail: Summary only (thumbnail already rendered above)
          trimmedSummary ? (
            <p className="text-foreground line-clamp-4 text-xs leading-relaxed">
              {trimmedSummary}
            </p>
          ) : null
        ) : trimmedSummary ? (
          // Pattern without thumbnail: full summary
          <p className="text-foreground line-clamp-5 flex-1 text-xs leading-relaxed">
            {trimmedSummary}
          </p>
        ) : null}
      </div>

      {/* Action buttons - visible on hover (desktop) or always visible (touch devices) */}
      <div className="pointer-events-auto absolute right-2 bottom-2 flex items-center gap-1 opacity-100 transition-opacity duration-200 sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100">
        {votes > 0 && (
          <BadgeV2
            variant="secondary"
            className="text-xs"
            data-testid="vote-count-badge"
          >
            {votes}
          </BadgeV2>
        )}
        <FavoriteButton
          articleId={article.id}
          className="bg-background/30 h-9 min-h-[44px] w-9 min-w-[44px]"
          isFavorited={isFavorited}
          onToggleFavorite={onToggleFavorite}
        />
        <ButtonV2
          variant="ghost"
          size="sm"
          iconOnly
          onClick={(e) => {
            e.stopPropagation();
            try {
              const url = new URL(article.url);
              if (url.protocol === 'http:' || url.protocol === 'https:') {
                window.open(article.url, '_blank', 'noopener,noreferrer');
              }
            } catch {
              // Invalid URL, ignore
            }
          }}
          className="bg-background/30 h-9 min-h-[44px] w-9 min-w-[44px]"
          aria-label="元記事を開く"
        >
          <ExternalLink className="h-4 w-4" />
        </ButtonV2>
      </div>
    </CardV2>
  );
}
