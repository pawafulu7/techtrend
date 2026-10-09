'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { Calendar, Download, Clock, ExternalLink } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { formatDateWithTime } from '@/lib/utils/date';
import type { ArticleCardProps } from '@/types/components';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/app/components/article/favorite-button';
import {
  NewLabel,
  SourceLabel,
  UnreadDot,
} from '@/app/components/article/article-meta';
import { useIsNewArticle } from '@/app/components/common/relative-time';
import { useReadStatus } from '@/app/components/article/hooks/use-read-status';
import { getReadingTime } from '@/app/components/article/hooks/get-reading-time';

/**
 * CompactCard - Title-only card for increased article density
 *
 * Displays:
 * - Unread dot / NEW label (if < 24h)
 * - Source name (no per-source color)
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
  const isRead = useReadStatus(article.id, initialIsRead);
  const router = useRouter(); // タグ遷移で使用
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Note: Use hook to avoid Date.now() during render (React Compiler purity rule)
  const isNew = useIsNewArticle(article.publishedAt, 24) ?? false;

  const contentLength = article.contentLength ?? article.content?.length ?? 0;
  const readingTime = getReadingTime(contentLength);

  // 戻り先は「このカードが置かれている一覧」（`/` 固定だと /papers 等から
  // 開いた記事の戻るがホームへ飛ぶ）
  const articleHref = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('returning', '1');
    const query = params.toString();
    const returnUrl = query ? `${pathname}?${query}` : pathname;
    return `/articles/${article.id}?from=${encodeURIComponent(returnUrl)}`;
  }, [article.id, pathname, searchParams]);

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
      <div className="relative z-10 flex min-w-0 items-center gap-1">
        <BadgeV2
          variant="outline"
          tabIndex={0}
          role="button"
          className="max-w-[120px] cursor-pointer truncate text-xs"
          data-testid="tag-item"
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
      id={`article-${article.id}`}
      data-testid="compact-card"
      data-article-id={article.id}
      className={cn(
        'group relative flex min-h-[140px] cursor-pointer flex-col gap-1 p-3',
        // フォーカスリングはタイトル Link を包むコンテナ側で表現する
        'focus-within:ring-2 focus-within:ring-(--tt-color-primary) focus-within:ring-offset-2'
      )}
    >
      {/* Status + Source Row */}
      <div className="flex min-w-0 items-center gap-2 text-xs">
        {!isRead && <UnreadDot />}
        {isNew && <NewLabel />}
        {showSource && article.source && (
          <SourceLabel name={article.companyName ?? article.source.name} />
        )}
      </div>

      {/* Timestamps Row */}
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[10px]">
        <span
          className="flex items-center gap-0.5"
          title="Published date"
          data-testid="article-date"
        >
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
          'text-foreground text-h3 line-clamp-2',
          isRead && 'opacity-70'
        )}
        data-testid="article-title"
      >
        <Link
          href={articleHref}
          prefetch={false}
          onClick={() => onArticleClick?.(article.id)}
          className="after:absolute after:inset-0 after:content-[''] focus:outline-none"
          data-testid="article-title-link"
        >
          {article.translatedTitle || article.title}
        </Link>
      </h3>

      {/* Tags */}
      {renderTags()}

      {/* Footer: ArticleCardと同じ構造 - 左=FavoriteButton、右=読了時間+元記事ボタン */}
      {/* 擬似要素のクリック領域より上に載せる（付け漏れるとボタン操作が記事遷移に化ける） */}
      <div className="relative z-10 mt-auto flex items-center justify-between pt-1">
        <FavoriteButton
          articleId={article.id}
          isFavorited={isFavorited}
          onToggleFavorite={onToggleFavorite}
          className="h-9 min-h-[36px] min-w-[36px] px-3"
        />
        <div className="flex items-center gap-2">
          {readingTime && (
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
