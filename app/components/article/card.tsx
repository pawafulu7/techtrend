'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Calendar, ExternalLink, Newspaper } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { isSlideSource } from '@/lib/utils/source/slide-source';
import { hasValidThumbnail } from '@/lib/utils/article/thumbnail';
import type { ArticleCardProps } from '@/types/components';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/app/components/article/favorite-button';
import {
  NewLabel,
  SourceLabel,
  UnreadDot,
} from '@/app/components/article/article-meta';
import { OptimizedImage } from '@/app/components/common/optimized-image';
import { useIsNewArticle } from '@/app/components/common/relative-time';
import { formatDateWithTime } from '@/lib/utils/date';
import { useReadStatus } from '@/app/components/article/hooks/use-read-status';

export function ArticleCard({
  article,
  onArticleClick,
  isRead: initialIsRead = false,
  isFavorited,
  onToggleFavorite,
  fetchInitialStatus = false,
  isFavoriteLoading = false,
  showSource = true,
  thumbnailPlaceholder = false,
}: ArticleCardProps & {
  isRead?: boolean;
  /**
   * 画像の無い記事にも空の枠を出し、同じ行のカードと高さを揃える。グリッドに並べる
   * 一覧（ArticleList）だけが有効にする。1列で並べる画面では揃える相手がいない
   */
  thumbnailPlaceholder?: boolean;
}) {
  const isRead = useReadStatus(article.id, initialIsRead);
  const pathname = usePathname();

  // T1: Thumbnail display with validation and error fallback
  const [thumbnailError, setThumbnailError] = useState(false);
  const thumbnailSrc =
    hasValidThumbnail(article.thumbnail) && !thumbnailError
      ? article.thumbnail
      : null;
  // 幅 sm 以上（複数列）でカードの上端に枠があるか。マウス端末の操作ボタンはこの枠に重ねる
  const hasFrame = thumbnailSrc !== null || thumbnailPlaceholder;
  const trimmedSummary = article.summary?.trim() || '';

  const searchParams = useSearchParams();
  const isNew = useIsNewArticle(article.publishedAt, 24) ?? false;

  // 戻り先は「このカードが置かれている一覧」。`/` 固定にすると /papers や
  // /favorites/feed から開いた記事の「記事一覧に戻る」がホームへ飛んでしまう
  const articleHref = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('returning', '1');
    const query = params.toString();
    const returnUrl = query ? `${pathname}?${query}` : pathname;
    return `/articles/${article.id}?from=${encodeURIComponent(returnUrl)}`;
  }, [article.id, pathname, searchParams]);

  const votes = article.userVotes || 0;

  return (
    <CardV2
      variant="hover"
      id={`article-${article.id}`}
      data-testid="article-card"
      data-article-id={article.id}
      className={cn(
        // @container: 1列で全幅に並ぶ画面（カード幅 36rem 以上）では枠の高さを抑える
        'group @container relative flex h-auto cursor-pointer flex-col gap-0 pb-3 sm:min-h-[240px]',
        // タイトル Link の擬似要素がカード全面を覆うため、フォーカスリングは
        // コンテナ側で表現する（キーボード操作でどのカードにいるか分かるように）
        'focus-within:ring-2 focus-within:ring-(--tt-color-primary) focus-within:ring-offset-2'
      )}
    >
      {/*
        サムネイル枠は 16:9 に固定し、同じ行のカードで高さを揃える。写真は枠いっぱいに
        切り抜き、スライドは文字が欠けないよう全体を収める。全幅のカードで 16:9 にすると
        画像が画面の半分を占めるため、幅 36rem 以上では高さ 12rem に収める
      */}
      {thumbnailSrc ? (
        <div className="relative isolate aspect-video w-full overflow-hidden rounded-t-lg bg-(--tt-color-surface-muted) @xl:aspect-auto @xl:h-48">
          <OptimizedImage
            src={thumbnailSrc}
            alt={article.title}
            fill
            priority={false}
            className={
              isSlideSource(article.source?.name)
                ? 'object-contain'
                : 'object-cover @xl:object-contain'
            }
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            onError={() => setThumbnailError(true)}
          />
        </div>
      ) : thumbnailPlaceholder ? (
        // 画像が無い記事も同じ枠で行の高さを揃える。揃える相手のいない
        // 1列表示（幅 sm 未満）では出さず、縦に伸ばさない
        <div
          className="hidden aspect-video w-full items-center justify-center rounded-t-lg bg-(--tt-color-surface-muted) text-(--tt-color-text-muted) sm:flex @xl:aspect-auto @xl:h-48"
          aria-hidden="true"
          data-testid="thumbnail-placeholder"
        >
          <Newspaper className="h-8 w-8 opacity-40" />
        </div>
      ) : null}

      {/* 情報の優先順位: タイトル → 要約 → メタ情報（下端に揃える） */}
      <div className="flex flex-1 flex-col gap-1.5 px-4 pt-3">
        <h3
          className={cn(
            'text-foreground text-h3 line-clamp-2',
            isRead && 'opacity-70'
          )}
          title={article.translatedTitle || article.title}
          data-testid="article-title"
        >
          {/* card-with-link: タイトルが実リンクで、擬似要素がカード全面の
              クリック領域になる。div+onClick と違いキーボードで開ける */}
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

        {trimmedSummary ? (
          <p
            className="text-foreground text-summary line-clamp-4"
            data-testid="article-summary"
          >
            {trimmedSummary}
          </p>
        ) : null}

        <div className="text-caption mt-auto flex min-w-0 items-center gap-2 pt-1">
          {!isRead && <UnreadDot />}
          {isNew && <NewLabel />}
          {showSource && article.source && (
            <SourceLabel name={article.companyName ?? article.source.name} />
          )}
          <span
            className="text-muted-foreground flex shrink-0 items-center gap-1"
            data-testid="article-date"
          >
            <Calendar className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">公開日:</span>
            <span>{formatDateWithTime(article.publishedAt)}</span>
          </span>
        </div>
      </div>

      {/*
        操作ボタン。タッチ端末（hover できない端末）と1列表示（幅 sm 未満）ではカード下端に
        常に出す。複数列のマウス端末ではサムネイルの枠の右上に重ね、hover かキーボード
        フォーカスで出す。枠が無いカードでは重ねるとタイトルを隠すため、下端に常に出す
      */}
      <div
        className={cn(
          'relative z-10 flex items-center justify-end gap-1 px-4 pt-1 transition-opacity duration-200',
          hasFrame && [
            'sm:[@media(hover:hover)]:absolute sm:[@media(hover:hover)]:top-2 sm:[@media(hover:hover)]:right-2 sm:[@media(hover:hover)]:rounded-full sm:[@media(hover:hover)]:bg-(--tt-color-surface)/85 sm:[@media(hover:hover)]:p-0.5 sm:[@media(hover:hover)]:opacity-0 sm:[@media(hover:hover)]:shadow-sm',
            'group-focus-within:opacity-100 group-hover:opacity-100',
          ]
        )}
      >
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
          className="bg-background/30 h-9 min-h-[44px] w-9 min-w-[44px] rounded-full"
          isFavorited={isFavorited}
          onToggleFavorite={onToggleFavorite}
          fetchInitialStatus={fetchInitialStatus}
          isStatusLoading={isFavoriteLoading}
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
          className="bg-background/30 h-9 min-h-[44px] w-9 min-w-[44px] rounded-full"
          aria-label="元記事を開く"
        >
          <ExternalLink className="h-4 w-4" />
        </ButtonV2>
      </div>
    </CardV2>
  );
}
