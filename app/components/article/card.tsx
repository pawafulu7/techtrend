'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ThumbsUp, ExternalLink, Calendar, Download, Clock } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { formatDateWithTime } from '@/lib/utils/date';
import { getSourceColor } from '@/lib/utils/source-colors';
import type { ArticleCardProps } from '@/types/components';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/app/components/article/favorite-button';
import { ShareButton } from '@/app/components/article/share-button';
import { OptimizedImage } from '@/app/components/common/optimized-image';

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
  const [votes, setVotes] = useState(article.userVotes || 0);
  const [hasVoted, setHasVoted] = useState(false);
  const [isRead, setIsRead] = useState(initialIsRead);
  const router = useRouter();

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

  useEffect(() => {
    setIsRead(initialIsRead);
  }, [initialIsRead]);

  const shouldShowThumbnail = (): boolean => {
    if (!article.source) {
      return false;
    }
    if (article.source.name === 'Speaker Deck' || article.source.name === 'Docswell') {
      return !!article.thumbnail;
    }
    if (article.content && article.content.length < 300 && article.thumbnail) {
      return true;
    }
    return false;
  };

  const showThumbnail = shouldShowThumbnail();
  const isTextOnly = !showThumbnail;

  const searchParams = useSearchParams();
  const publishedDate = new Date(article.publishedAt);
  const hoursAgo = Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
  const isNew = hoursAgo < 24;
  const sourceColor = article.source ? getSourceColor(article.source.name) : null;

  // Reading time calculation (~500 chars/min for Japanese content)
  // Use contentLength from API (pre-calculated) or fallback to content.length
  const contentLength = article.contentLength ?? article.content?.length ?? 0;
  const readingTime = contentLength > 0 ? Math.max(1, Math.ceil(contentLength / 500)) : null;

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) {
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

  const handleVote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasVoted) return;

    try {
      const response = await fetch(`/api/articles/${article.id}/vote`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        setVotes(data.votes);
        setHasVoted(true);
      }
    } catch {
      // noop: silent fail to keep card interaction lightweight
    }
  };

  const renderTags = () => {
    if (!showTags || !article.tags || article.tags.length === 0) {
      return null;
    }

    const visibleTags = article.tags.slice(0, 2);
    const remainingCount = article.tags.length - visibleTags.length;

    return (
      <div className="flex flex-wrap items-center gap-1 pt-1">
        {visibleTags.map((tag) => (
          <BadgeV2
            key={tag.id}
            variant="outline"
            className="text-xs cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (onTagClick) {
                onTagClick(tag.name);
              } else {
                router.push(`/?tags=${encodeURIComponent(tag.name)}&tagMode=OR`);
              }
            }}
          >
            {tag.name}
          </BadgeV2>
        ))}
        {remainingCount > 0 && (
          <span className="text-xs text-muted-foreground">+{remainingCount}</span>
        )}
      </div>
    );
  };

  return (
    <CardV2
      variant="hover"
      id={`article-${article.id}`}
      data-testid="article-card"
      data-article-id={article.id}
      onClick={handleCardClick}
      className={cn(
        'group relative flex h-full flex-col gap-3 p-4 cursor-pointer',
        isTextOnly && 'border border-muted/40 shadow-sm'
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2.5">
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                {isNew && (
                  <BadgeV2 variant="primary" className="text-xs">
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
                      "text-xs",
                      sourceColor.tag,
                      sourceColor.border,
                      sourceColor.hover
                    )}
                    data-testid="article-source"
                  >
                    {article.companyName ?? article.source.name}
                  </BadgeV2>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDateWithTime(article.publishedAt)}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Download className="h-3 w-3" />
                  <span>{formatDateWithTime(article.createdAt)}</span>
                </span>
              </div>
            </div>
            <ShareButton title={article.title} url={article.url} size="sm" variant="ghost" />
          </div>
          {!showThumbnail && (
            <h3
              className={cn(
                'font-heading text-lg font-semibold leading-snug text-(--tt-color-text)',
                isRead && 'opacity-70',
                !isTextOnly && 'line-clamp-2'
              )}
            >
              {article.translatedTitle || article.title}
            </h3>
          )}
        </div>
      </div>

      <div className="w-full">
        {showThumbnail ? (
          <div
            className="relative isolate w-full overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800"
            style={{ aspectRatio: '3 / 2', minHeight: '160px' }}
          >
            <OptimizedImage
              src={article.thumbnail!}
              alt={article.title}
              fill
              priority={false}
              className="object-contain p-3 transition-transform duration-300 ease-out group-hover:scale-[1.01]"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </div>
        ) : article.summary ? (
          <p className="text-sm leading-relaxed text-(--tt-color-text-muted)">
            {article.summary}
          </p>
        ) : null}
      </div>

      {renderTags()}

      <div className="mt-auto flex items-center justify-between pt-1">
        <FavoriteButton
          articleId={article.id}
          className="h-9 px-3"
          isFavorited={isFavorited}
          onToggleFavorite={onToggleFavorite}
        />
        <div className="flex items-center gap-2">
          {readingTime && contentLength > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{readingTime}min / {contentLength.toLocaleString('ja-JP')}字</span>
            </span>
          )}
          <ButtonV2
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              window.open(article.url, '_blank', 'noopener,noreferrer');
            }}
            className="h-9 px-3 text-xs"
          >
            <ExternalLink className="h-4 w-4 mr-1" />
            元記事
          </ButtonV2>
          {votes > 0 && <span className="text-xs text-muted-foreground">{votes}</span>}
          <ButtonV2
            variant={hasVoted ? 'primary' : 'outline'}
            size="sm"
            iconOnly
            onClick={handleVote}
            disabled={hasVoted}
            data-testid="vote-button"
            aria-pressed={hasVoted}
            className="h-9 w-9"
          >
            <ThumbsUp className="h-4 w-4" />
          </ButtonV2>
        </div>
      </div>
    </CardV2>
  );
}
