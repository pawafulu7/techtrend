'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, Calendar, Clock, Heart } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { formatDateWithTime } from '@/lib/utils/date';
import { getSourceColor } from '@/lib/utils/source/source-colors';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/app/components/article/favorite-button';
import { ShareButton } from '@/app/components/article/share-button';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { FavoriteArticle } from '@/lib/types/favorites';
import { getReadingTime } from '@/app/components/article/hooks/get-reading-time';

export interface FavoriteArticleCardProps {
  article: FavoriteArticle;
  onArticleClick?: (articleId: string) => void;
  onTagClick?: (tagName: string) => void;
  onRemoveFavorite?: (articleId: string) => void;
  from?: string;
}

export function FavoriteArticleCard({
  article,
  onArticleClick,
  onTagClick,
  onRemoveFavorite,
  from = '/favorites',
}: FavoriteArticleCardProps) {
  const router = useRouter();
  const sourceColor = getSourceColor(article.source.name);

  const contentLength = article.contentLength ?? article.content?.length ?? 0;
  const readingTime = getReadingTime(contentLength);

  // Pre-compute favoritedAt formatting to avoid duplicate Date object creation
  // Use try-catch to handle invalid date values gracefully
  let favoritedTimeAgo: string;
  try {
    const date = new Date(article.favoritedAt);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date');
    }
    favoritedTimeAgo = formatDistanceToNow(date, {
      addSuffix: true,
      locale: ja,
    });
  } catch {
    favoritedTimeAgo = '不明';
  }

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore clicks on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, [role="button"]')) {
      return;
    }

    if (onArticleClick) {
      onArticleClick(article.id);
    }

    const articleUrl = `/articles/${article.id}?from=${encodeURIComponent(from)}`;
    router.push(articleUrl);
  };

  const handleToggleFavorite = () => {
    // Delegate to parent handler (which handles API call and cache update)
    if (onRemoveFavorite) {
      onRemoveFavorite(article.id);
    }
  };

  const renderTags = () => {
    if (!article.tags || article.tags.length === 0) {
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
          <span
            className="text-muted-foreground text-xs"
            aria-label={`他${remainingCount}件のタグ`}
          >
            +{remainingCount}
          </span>
        )}
      </div>
    );
  };

  return (
    <CardV2
      variant="hover"
      data-testid="favorite-article-card"
      data-article-id={article.id}
      onClick={handleCardClick}
      className={cn(
        'group relative flex h-full cursor-pointer flex-col gap-3 p-4',
        'shadow-md hover:shadow-lg',
        'transition-[transform,box-shadow] duration-200 hover:scale-[1.01]',
        sourceColor?.borderLeft
      )}
    >
      {/* Header: Source Badge + Favorited At Badge + Published At */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Source Badge */}
            {sourceColor && (
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
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    sourceColor.dot
                  )}
                  aria-hidden="true"
                />
                {article.companyName ?? article.source.name}
              </BadgeV2>
            )}

            {/* Favorited At Badge */}
            <BadgeV2
              variant="secondary"
              className="flex items-center gap-1 text-xs"
              aria-label={`保存: ${favoritedTimeAgo}`}
            >
              <Heart className="h-3 w-3" aria-hidden="true" />
              <time dateTime={article.favoritedAt}>{favoritedTimeAgo}</time>
            </BadgeV2>

            {/* Published At - inline with badges */}
            <span className="text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" aria-hidden="true" />
              <time dateTime={article.publishedAt}>
                {formatDateWithTime(article.publishedAt)}
              </time>
            </span>
          </div>
        </div>

        <div className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center">
          <ShareButton
            title={article.translatedTitle || article.title}
            url={article.url}
            size="sm"
            variant="ghost"
          />
        </div>
      </div>

      {/* Title */}
      <h3 className="font-heading text-foreground line-clamp-2 text-lg leading-snug font-semibold sm:text-xl">
        <Link
          href={`/articles/${article.id}?from=${encodeURIComponent(from)}`}
          className="hover:text-primary transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {article.translatedTitle || article.title}
        </Link>
      </h3>

      {/* Summary */}
      {article.summary && (
        <p className="text-foreground line-clamp-3 text-sm leading-relaxed">
          {article.summary}
        </p>
      )}

      {/* Tags */}
      {renderTags()}

      {/* Footer: Favorite + Reading Time + External Link */}
      <div className="mt-auto flex items-center justify-between pt-1">
        <FavoriteButton
          articleId={article.id}
          className="h-11 min-h-[44px] min-w-[44px] px-4"
          isFavorited={true}
          onToggleFavorite={handleToggleFavorite}
        />
        <div className="flex items-center gap-3">
          {readingTime && (
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <Clock className="h-3 w-3" aria-hidden="true" />
              <span>
                {readingTime}分 / {contentLength.toLocaleString('ja-JP')}文字
              </span>
            </span>
          )}
          <ButtonV2
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              window.open(article.url, '_blank', 'noopener,noreferrer');
            }}
            className="h-11 min-h-[44px] min-w-[44px] px-4 text-xs"
            aria-label="元記事を新しいタブで開く"
          >
            <ExternalLink className="mr-1 h-4 w-4" aria-hidden="true" />
            元記事
          </ButtonV2>
        </div>
      </div>
    </CardV2>
  );
}

/**
 * Skeleton component for loading state
 */
export function FavoriteCardSkeleton() {
  return (
    <div
      className="bg-card h-[280px] animate-pulse space-y-3 rounded-lg border p-4"
      role="status"
      aria-label="読み込み中"
    >
      <div className="flex items-center gap-2">
        <div className="bg-muted h-5 w-20 rounded" />
        <div className="bg-muted h-5 w-16 rounded" />
      </div>
      <div className="bg-muted h-6 w-full rounded" />
      <div className="space-y-2">
        <div className="bg-muted h-4 w-full rounded" />
        <div className="bg-muted h-4 w-5/6 rounded" />
        <div className="bg-muted h-4 w-4/6 rounded" />
      </div>
      <div className="flex gap-1 pt-2">
        <div className="bg-muted h-5 w-12 rounded" />
        <div className="bg-muted h-5 w-14 rounded" />
      </div>
      <div className="mt-auto flex items-center justify-between pt-2">
        <div className="bg-muted h-8 w-8 rounded" />
        <div className="bg-muted h-8 w-20 rounded" />
      </div>
    </div>
  );
}

/**
 * Skeleton grid for loading state
 */
export function FavoriteSkeletonGrid() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      role="status"
      aria-live="polite"
      aria-label="お気に入りを読み込み中"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <FavoriteCardSkeleton key={i} />
      ))}
    </div>
  );
}
