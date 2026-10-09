'use client';

import { getTagDisplayName } from '@/lib/constants/tag-labels';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { Calendar, Clock, Download, ExternalLink } from 'lucide-react';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { formatDate, formatDateWithTime } from '@/lib/utils/date';
import type { ArticleListItemProps } from '@/types/components';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/app/components/article/favorite-button';
import {
  NewLabel,
  SourceLabel,
  UnreadDot,
} from '@/app/components/article/article-meta';
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
        'group relative flex cursor-pointer items-center justify-between gap-3 rounded-lg p-3',
        'bg-(--tt-color-surface)',
        'transition-all duration-200',
        'hover:bg-(--tt-color-surface-hover)',
        'border border-(--tt-color-border)',
        'hover:border-(--tt-color-border-hover)',
        'hover:shadow-sm',
        'focus-within:ring-2 focus-within:ring-(--tt-color-primary)'
      )}
    >
      {/* 左: タイトル → 要約 → メタ情報。メタを右列に置くと狭い幅でタイトルが潰れるため下の行へ */}
      <div className="min-w-0 flex-1">
        <h3
          data-testid="article-title"
          className="text-foreground text-h3 line-clamp-1 group-hover:text-(--tt-color-primary)"
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
        {article.summary && (
          <p
            data-testid="article-summary"
            className="text-muted-foreground text-summary mt-0.5 line-clamp-1"
          >
            {article.summary}
          </p>
        )}

        <div className="text-caption text-muted-foreground mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {!isRead && <UnreadDot />}
          {isNew && <NewLabel />}
          <SourceLabel
            name={article.companyName ?? article.source.name}
            className="max-w-48"
          />
          <span className="hidden items-center gap-1 sm:flex">
            <Calendar className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">公開日:</span>
            <span>{formatDateWithTime(article.publishedAt)}</span>
          </span>
          <span className="hidden items-center gap-1 sm:flex">
            <Download className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">収集日:</span>
            <span>{formatDateWithTime(article.createdAt)}</span>
          </span>
          <span className="flex items-center gap-1 sm:hidden">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {hoursAgo !== null && hoursAgo < 24
              ? `${hoursAgo}h`
              : formatDate(article.publishedAt)}
          </span>

          {article.tags && article.tags.length > 0 && (
            <div className="relative z-10 hidden flex-wrap gap-1 sm:flex">
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
                    {getTagDisplayName(tag.name)}
                  </button>
                </BadgeV2>
              ))}
            </div>
          )}
        </div>
      </div>

      {/*
        右: 操作ボタン。擬似要素のクリック領域より上に載せる（付け漏れると操作が記事遷移に化ける）。
        タッチ端末（hover できない端末）では常に出す。マウス端末では hover かキーボード
        フォーカスで出し、出ていないときも幅を確保してタイトルの折り返しを変えない
      */}
      <div
        className="relative z-10 flex shrink-0 items-center gap-1 transition-opacity duration-200 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:opacity-0"
        data-testid="article-actions"
      >
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
  );
}
