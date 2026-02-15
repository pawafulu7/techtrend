'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { getSourceColor } from '@/lib/utils/source-colors';
import type { ArticleCardProps } from '@/types/components';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/app/components/article/favorite-button';
import { OptimizedImage } from '@/app/components/common/optimized-image';
import {
  RelativeTime,
  useIsNewArticle,
} from '@/app/components/common/relative-time';

const MAX_SUMMARY_LENGTH = 200;
const MAX_SUMMARY_LENGTH_SHORT = 80;

export function ArticleCard({
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

  // T1: Presentation type detection (Speaker Deck / Docswell)
  const isPresentation = (() => {
    let isSpeakerDeck = article.source?.name === 'Speaker Deck';
    let isDocswell = article.source?.name === 'Docswell';

    if (!isSpeakerDeck && !isDocswell && article.url) {
      try {
        const hostname = new URL(article.url).hostname;
        isSpeakerDeck =
          hostname === 'speakerdeck.com' ||
          hostname.endsWith('.speakerdeck.com');
        isDocswell =
          hostname === 'www.docswell.com' || hostname === 'docswell.com';
      } catch {
        // Invalid URL, skip URL-based detection
      }
    }

    return isSpeakerDeck || isDocswell;
  })();

  // T1: Simplified thumbnail display - show whenever thumbnail exists
  const showThumbnail = !!article.thumbnail;

  const searchParams = useSearchParams();
  const sortBy = searchParams.get('sortBy');
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
    params.delete('returning');
    params.set('returning', '1');

    const returnUrl = `/?${params.toString()}`;
    const articleUrl = `/articles/${article.id}?from=${encodeURIComponent(returnUrl)}`;
    router.push(articleUrl);
  };

  const renderTags = () => {
    if (!showTags || !article.tags || article.tags.length === 0) {
      return null;
    }

    const visibleTags = article.tags.slice(0, 2);
    const remainingCount = article.tags.length - visibleTags.length;

    return (
      <>
        {visibleTags.map((tag) => (
          <BadgeV2
            key={tag.id}
            variant="outline"
            className="cursor-pointer text-xs"
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
          >
            {tag.name}
          </BadgeV2>
        ))}
        {remainingCount > 0 && (
          <span className="text-muted-foreground text-xs">
            +{remainingCount}
          </span>
        )}
      </>
    );
  };

  const votes = article.userVotes || 0;

  return (
    <CardV2
      variant="hover"
      id={`article-${article.id}`}
      data-testid="article-card"
      data-article-id={article.id}
      onClick={handleCardClick}
      className={cn(
        'group relative flex h-auto cursor-pointer flex-col gap-1.5 p-4 sm:min-h-[240px]',
        !showThumbnail && 'border-muted/40 border shadow-sm',
        isNew
          ? 'border-t-2 border-t-green-500/60 dark:border-t-green-400/40'
          : sourceColor?.borderLeft
      )}
    >
      {/* Header: Title (Pattern 2/3 only) */}
      {!isPresentation && (
        <h3
          className={cn(
            'font-heading text-foreground line-clamp-2 text-lg leading-snug font-semibold sm:text-xl',
            isRead && 'opacity-70'
          )}
          title={article.translatedTitle || article.title}
        >
          {article.translatedTitle || article.title}
        </h3>
      )}

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
        <span className="text-muted-foreground">
          <RelativeTime date={article.publishedAt} />
        </span>
        {sortBy === 'createdAt' && (
          <span className="text-muted-foreground flex items-center gap-1">
            <span>取得:</span>
            <RelativeTime date={article.createdAt} />
          </span>
        )}
      </div>

      {/* Content area: 3 patterns */}
      {isPresentation && showThumbnail ? (
        // Pattern 1: Presentation - large thumbnail, no title
        <div className="relative isolate min-h-0 w-full flex-1 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
          <OptimizedImage
            src={article.thumbnail!}
            alt={article.title}
            fill
            priority={false}
            className="object-contain p-3 transition-transform duration-300 ease-out group-hover:scale-[1.01]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        </div>
      ) : showThumbnail ? (
        // Pattern 2: Thumbnail + short summary
        <div className="flex flex-col gap-1.5">
          <div className="relative isolate h-[60px] w-full overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
            <OptimizedImage
              src={article.thumbnail!}
              alt={article.title}
              fill
              priority={false}
              className="object-cover object-top transition-transform duration-300 ease-out group-hover:scale-[1.01]"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </div>
          {article.summary && (
            <p className="text-foreground line-clamp-2 text-sm leading-relaxed">
              {article.summary.length > MAX_SUMMARY_LENGTH_SHORT
                ? `${article.summary.slice(0, MAX_SUMMARY_LENGTH_SHORT)}…`
                : article.summary}
            </p>
          )}
        </div>
      ) : article.summary ? (
        // Pattern 3: Text only - full summary
        <p className="text-foreground flex-1 text-sm leading-relaxed">
          {article.summary.length > MAX_SUMMARY_LENGTH
            ? `${article.summary.slice(0, MAX_SUMMARY_LENGTH)}…`
            : article.summary}
        </p>
      ) : null}

      {/* Footer: tags + action buttons */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {renderTags()}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {votes > 0 && (
            <BadgeV2 variant="secondary" className="text-xs">
              {votes}
            </BadgeV2>
          )}
          <FavoriteButton
            articleId={article.id}
            className="h-9 min-h-[44px] w-9 min-w-[44px]"
            isFavorited={isFavorited}
            onToggleFavorite={onToggleFavorite}
          />
          <ButtonV2
            variant="ghost"
            size="sm"
            iconOnly
            onClick={(e) => {
              e.stopPropagation();
              window.open(article.url, '_blank', 'noopener,noreferrer');
            }}
            className="h-9 min-h-[44px] w-9 min-w-[44px]"
            aria-label="元記事を開く"
          >
            <ExternalLink className="h-4 w-4" />
          </ButtonV2>
        </div>
      </div>
    </CardV2>
  );
}
