'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { Clock, TrendingUp, ExternalLink, Eye } from 'lucide-react';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { formatDate, formatDateWithTime } from '@/lib/utils/date';
import { getSourceColor } from '@/lib/utils/source/source-colors';
import type { ArticleListItemProps } from '@/types/components';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/app/components/article/favorite-button';
import { useIsNewArticle } from '@/app/components/common/relative-time';
import { useReadStatus } from '@/app/components/article/hooks/use-read-status';
export function ArticleListItem({
  article,
  onTagClick,
  onArticleClick,
  isRead: initialIsRead = true,
  isFavorited = false,
  onToggleFavorite,
}: ArticleListItemProps) {
  const isRead = useReadStatus(article.id, initialIsRead);
  const router = useRouter(); // タグ遷移で使用
  const pathname = usePathname();

  // Note: Date.now() called in useEffect to avoid purity violations during render
  const isNew = useIsNewArticle(article.publishedAt, 24) ?? false;
  const [hoursAgo, setHoursAgo] = useState<number | null>(null);
  useEffect(() => {
    const publishedDate = new Date(article.publishedAt);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: derive display value from current time
    setHoursAgo(
      Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60))
    );
  }, [article.publishedAt]);

  const searchParams = useSearchParams();
  const sourceColor = getSourceColor(article.source?.name || 'Unknown');

  // 戻り先は「このカードが置かれている一覧」（`/` 固定だと /papers 等から
  // 開いた記事の戻るがホームへ飛ぶ）
  const articleHref = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('returning', '1');
    const query = params.toString();
    const returnUrl = query ? `${pathname}?${query}` : pathname;
    return `/articles/${article.id}?from=${encodeURIComponent(returnUrl)}`;
  }, [article.id, pathname, searchParams]);

  return (
    <div
      id={`article-${article.id}`}
      data-article-id={article.id}
      className={cn(
        // href を持たない role="link" は SR にリンク先を伝えられないため撤去し、
        // タイトルを実リンクにする card-with-link へ移行。relative は擬似要素の基準
        'group relative flex cursor-pointer items-center justify-between gap-4 rounded-lg p-3',
        'bg-(--tt-color-surface)',
        'transition-all duration-200',
        'hover:bg-(--tt-color-surface-hover)',
        'border border-(--tt-color-border)',
        'hover:border-(--tt-color-border-hover)',
        'hover:shadow-sm',
        'focus-within:ring-2 focus-within:ring-(--tt-color-primary)',
        sourceColor.hover
      )}
    >
      {/* Left: title and tags */}
      <div className="min-w-0 flex-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isNew && (
              <BadgeV2 className="flex-shrink-0 text-xs" variant="positive">
                <TrendingUp className="mr-0.5 h-3 w-3" />
                New
              </BadgeV2>
            )}
            {!isRead && (
              <BadgeV2 className="flex-shrink-0 text-xs" variant="info">
                <Eye className="mr-0.5 h-3 w-3" />
                未読
              </BadgeV2>
            )}
            <h3
              data-testid="article-title"
              className="text-foreground line-clamp-1 text-sm font-medium group-hover:text-(--tt-color-primary)"
              title={article.translatedTitle || article.title}
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
          </div>
          {article.summary && (
            <p
              data-testid="article-summary"
              className="text-muted-foreground mt-0.5 line-clamp-1 text-xs"
            >
              {article.summary}
            </p>
          )}
        </div>

        {article.tags && article.tags.length > 0 && (
          <div className="relative z-10 mt-1 hidden flex-wrap gap-1 sm:flex">
            {article.tags.slice(0, 3).map((tag) => (
              <BadgeV2
                key={tag.id}
                variant="outline"
                className="h-5 cursor-pointer px-1.5 py-0 text-xs"
                asChild
              >
                <button
                  type="button"
                  data-testid="tag-item"
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
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {tag.name}
                </button>
              </BadgeV2>
            ))}
          </div>
        )}
      </div>

      {/* Right: meta info and actions */}
      <div className="flex flex-shrink-0 items-center gap-2">
        <BadgeV2
          variant="secondary"
          className={cn('text-xs font-medium', sourceColor.tag)}
        >
          {article.source?.name || 'Unknown'}
        </BadgeV2>

        <div className="text-muted-foreground flex flex-col gap-0.5 text-xs">
          <div className="hidden flex-col gap-0.5 sm:flex">
            <span className="flex items-center gap-1">
              <span aria-hidden="true">📅</span>
              <span className="sr-only">公開日:</span>
              <span>{formatDateWithTime(article.publishedAt)}</span>
            </span>
            <span className="flex items-center gap-1">
              <span aria-hidden="true">📥</span>
              <span className="sr-only">収集日:</span>
              <span>{formatDateWithTime(article.createdAt)}</span>
            </span>
          </div>
          <span className="flex items-center gap-1 sm:hidden">
            <Clock className="h-3 w-3" />
            {hoursAgo !== null && hoursAgo < 24
              ? `${hoursAgo}h`
              : formatDate(article.publishedAt)}
          </span>
        </div>

        {/* 擬似要素のクリック領域より上に載せる（付け漏れると操作が記事遷移に化ける） */}
        <div className="relative z-10 hidden items-center gap-1 group-focus-within:flex group-hover:flex">
          <FavoriteButton
            articleId={article.id}
            compact
            isFavorited={isFavorited}
            onToggleFavorite={onToggleFavorite}
            className="h-11 min-h-[44px] w-11 min-w-[44px]"
          />
          <ButtonV2
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              window.open(article.url, '_blank', 'noopener,noreferrer');
            }}
            className="h-11 min-h-[44px] w-11 min-w-[44px] p-0"
            title="元記事を開く"
            aria-label="元記事を開く"
          >
            <ExternalLink className="h-3 w-3" />
          </ButtonV2>
        </div>
      </div>
    </div>
  );
}
