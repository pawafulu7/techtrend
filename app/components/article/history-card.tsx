'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, Calendar, Clock } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { formatDateWithTime } from '@/lib/utils/date';
import { getSourceColor } from '@/lib/utils/source-colors';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/app/components/article/favorite-button';
import { ShareButton } from '@/app/components/article/share-button';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';

export interface HistoryArticleCardProps {
  article: {
    id: string;
    title: string;
    translatedTitle?: string | null;
    summary: string | null;
    url: string;
    publishedAt: string;
    source: {
      id: string;
      name: string;
    };
    companyName?: string | null;
    tags?: Array<{
      id: string;
      name: string;
    }>;
    contentLength?: number;
    content?: string | null;
  };
  viewedAt: string | null;
  onArticleClick?: (articleId: string) => void;
  onTagClick?: (tagName: string) => void;
}

export function HistoryArticleCard({
  article,
  viewedAt,
  onArticleClick,
  onTagClick,
}: HistoryArticleCardProps) {
  const router = useRouter();
  const sourceColor = getSourceColor(article.source.name);

  // Reading time calculation (~500 chars/min for Japanese content)
  const contentLength = article.contentLength ?? article.content?.length ?? 0;
  const readingTime = contentLength > 0 ? Math.max(1, Math.ceil(contentLength / 500)) : null;

  // Pre-compute viewedAt formatting to avoid duplicate Date object creation
  const viewedTimeAgo = viewedAt
    ? formatDistanceToNow(new Date(viewedAt), { addSuffix: true, locale: ja })
    : null;

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore clicks on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, [role="button"]')) {
      return;
    }

    if (onArticleClick) {
      onArticleClick(article.id);
    }

    const articleUrl = `/articles/${article.id}?from=${encodeURIComponent('/history')}`;
    router.push(articleUrl);
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
          <span
            className="text-xs text-muted-foreground"
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
      data-testid="history-article-card"
      data-article-id={article.id}
      onClick={handleCardClick}
      className={cn(
        'group relative flex h-full flex-col gap-3 p-4 cursor-pointer',
        'shadow-md hover:shadow-lg',
        'transition-[transform,box-shadow] duration-200 hover:scale-[1.01]',
        sourceColor?.borderLeft
      )}
    >
      {/* Header: Source Badge + Viewed At Badge + Published At */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Source Badge */}
            {sourceColor && (
              <BadgeV2
                variant="outline"
                className={cn(
                  'text-xs flex items-center gap-1.5',
                  sourceColor.tag,
                  sourceColor.border,
                  sourceColor.hover
                )}
                data-testid="article-source"
              >
                <span
                  className={cn('w-2 h-2 rounded-full shrink-0', sourceColor.dot)}
                  aria-hidden="true"
                />
                {article.companyName ?? article.source.name}
              </BadgeV2>
            )}

            {/* Viewed At Badge */}
            {viewedAt && viewedTimeAgo && (
              <BadgeV2
                variant="secondary"
                className="text-xs flex items-center gap-1"
                aria-label={`閲覧: ${viewedTimeAgo}`}
              >
                <Clock className="h-3 w-3" aria-hidden="true" />
                <time dateTime={viewedAt}>{viewedTimeAgo}</time>
              </BadgeV2>
            )}

            {/* Published At - inline with badges */}
            <span className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3 w-3" aria-hidden="true" />
              <time dateTime={article.publishedAt}>
                {formatDateWithTime(article.publishedAt)}
              </time>
            </span>
          </div>
        </div>

        <div className="min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0">
          <ShareButton
            title={article.translatedTitle || article.title}
            url={article.url}
            size="sm"
            variant="ghost"
          />
        </div>
      </div>

      {/* Title */}
      <h3 className="font-heading text-lg sm:text-xl font-semibold leading-snug text-foreground line-clamp-2">
        <Link
          href={`/articles/${article.id}`}
          className="hover:text-primary transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {article.translatedTitle || article.title}
        </Link>
      </h3>

      {/* Summary */}
      {article.summary && (
        <p className="text-sm leading-relaxed text-foreground line-clamp-3">
          {article.summary}
        </p>
      )}

      {/* Tags */}
      {renderTags()}

      {/* Footer: Favorite + Reading Time + External Link */}
      <div className="mt-auto flex items-center justify-between pt-1">
        <FavoriteButton
          articleId={String(article.id)}
          className="h-11 px-4 min-w-[44px] min-h-[44px]"
          fetchInitialStatus
        />
        <div className="flex items-center gap-3">
          {readingTime && contentLength > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              <span>{readingTime}分 / {contentLength.toLocaleString('ja-JP')}文字</span>
            </span>
          )}
          <ButtonV2
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              window.open(article.url, '_blank', 'noopener,noreferrer');
            }}
            className="h-11 px-4 text-xs min-w-[44px] min-h-[44px]"
            aria-label="元記事を新しいタブで開く"
          >
            <ExternalLink className="h-4 w-4 mr-1" aria-hidden="true" />
            元記事
          </ButtonV2>
        </div>
      </div>
    </CardV2>
  );
}
