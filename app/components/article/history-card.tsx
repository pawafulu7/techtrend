'use client';

import { getTagDisplayName } from '@/lib/constants/tag-labels';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, Calendar, Clock } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { formatDateWithTime } from '@/lib/utils/date';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/app/components/article/favorite-button';
import { SourceLabel } from '@/app/components/article/article-meta';
import { ShareButton } from '@/app/components/article/share-button';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { getReadingTime } from '@/app/components/article/hooks/get-reading-time';

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
  from?: string;
  /**
   * お気に入り状態（一覧画面のバッチ取得の結果）。未指定なら「未登録」と表示する。
   * 状態を渡せない画面では fetchInitialStatus を true にしてカード側で取得する
   */
  isFavorited?: boolean;
  /** isFavorited を取得中。FavoriteButton を取得中の表示・無効化にする */
  isFavoriteLoading?: boolean;
  /** バッチ取得に失敗したとき、カード側で個別に取得する */
  fetchInitialStatus?: boolean;
}

export function HistoryArticleCard({
  article,
  viewedAt,
  onArticleClick,
  onTagClick,
  from = '/history',
  isFavorited = false,
  isFavoriteLoading = false,
  fetchInitialStatus = false,
}: HistoryArticleCardProps) {
  const router = useRouter();

  const contentLength = article.contentLength ?? article.content?.length ?? 0;
  const readingTime = getReadingTime(contentLength);

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

    const articleUrl = `/articles/${article.id}?from=${encodeURIComponent(from)}`;
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
            {getTagDisplayName(tag.name)}
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
      data-testid="history-article-card"
      data-article-id={article.id}
      onClick={handleCardClick}
      className={cn(
        'group relative flex h-full cursor-pointer flex-col gap-3 p-4',
        'shadow-md hover:shadow-lg',
        'transition-[transform,box-shadow] duration-200 hover:scale-[1.01]'
      )}
    >
      {/* Header: Source + Viewed At Badge + Published At */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Source */}
            <SourceLabel name={article.companyName ?? article.source.name} />

            {/* Viewed At Badge */}
            {viewedAt && viewedTimeAgo && (
              <BadgeV2
                variant="secondary"
                className="flex items-center gap-1 text-xs"
                aria-label={`閲覧: ${viewedTimeAgo}`}
              >
                <Clock className="h-3 w-3" aria-hidden="true" />
                <time dateTime={viewedAt}>{viewedTimeAgo}</time>
              </BadgeV2>
            )}

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
      <h3 className="text-foreground text-h3 line-clamp-2">
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
        <p className="text-foreground text-summary line-clamp-3">
          {article.summary}
        </p>
      )}

      {/* Tags */}
      {renderTags()}

      {/* Footer: Favorite + Reading Time + External Link */}
      <div className="mt-auto flex items-center justify-between pt-1">
        <FavoriteButton
          articleId={String(article.id)}
          className="h-11 min-h-[44px] min-w-[44px] px-4"
          isFavorited={isFavorited}
          isStatusLoading={isFavoriteLoading}
          fetchInitialStatus={fetchInitialStatus}
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
