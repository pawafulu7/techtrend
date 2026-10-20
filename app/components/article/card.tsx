'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Calendar, ExternalLink } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { ButtonV2 } from '@/components/ui-v2/button-v2';
import { isSlideArticle } from '@/lib/utils/source/slide-source';
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
import { TranslationBadge } from '@/components/ui/translation-badge';
import {
  RelativeTime,
  useIsNewArticle,
} from '@/app/components/common/relative-time';
import { QualityMeter } from '@/app/components/article/quality-meter';
import { formatDateWithTime } from '@/lib/utils/date';
import { useReadStatus } from '@/app/components/article/hooks/use-read-status';

// サムネイルの表示幅（srcset の候補を選ぶのに使う。Issue #718）。
// グリッドは list.tsx の GRID_CLASS と同じ列数（1 → sm 2 → lg 3 → xl 4 → 2xl 5）
const THUMBNAIL_SIZES_GRID =
  '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, (max-width: 1279px) 33vw, (max-width: 1535px) 25vw, 20vw';
// 1 列（リスト表示・お気に入りフィード）は高さ 12rem に収めるので、16:9 でも幅は 342px まで
const THUMBNAIL_SIZES_STACK = '342px';

export function ArticleCard({
  article,
  onArticleClick,
  isRead: initialIsRead = false,
  isFavorited,
  onToggleFavorite,
  fetchInitialStatus = false,
  isFavoriteLoading = false,
  showSource = true,
  layout = 'stack',
  thumbnailPlaceholder = false,
}: ArticleCardProps & {
  isRead?: boolean;
  /**
   * カードの並べ方。'grid' は複数列のグリッド（ArticleList）用で、サムネイル枠を 16:9 に
   * 固定し、複数列のマウス端末では操作ボタンを画像に重ねる。'stack' は1列で全幅に並べる
   * 画面用で、枠の高さを 12rem に抑えて画像全体を表示し、操作ボタンは常に下端に出す
   */
  layout?: 'grid' | 'stack';
  /**
   * 画像の無い記事に「観測記録」の枠（ソース名・公開からの時間・品質の目盛り）を出し、同じ行のカードと
   * 高さを揃える（layout が 'grid' のときだけ。1列表示では細い帯）。画像のある記事は、品質の目盛りを
   * メタ情報の行に出す（画像の有無で出す情報を変えない）。画像がほぼ無い一覧（/papers）では出さない
   */
  thumbnailPlaceholder?: boolean;
}) {
  const isRead = useReadStatus(article.id, initialIsRead);
  const pathname = usePathname();

  // T1: Thumbnail display with validation and error fallback
  // 失敗した URL を覚える。真偽値だと、再取得で同じカードに別の画像が届いても出せない
  const [erroredThumbnail, setErroredThumbnail] = useState<string | null>(null);
  const thumbnailError =
    erroredThumbnail !== null && erroredThumbnail === article.thumbnail;
  const thumbnailSrc =
    hasValidThumbnail(article.thumbnail) && !thumbnailError
      ? article.thumbnail
      : null;
  const isGrid = layout === 'grid';
  const showPlaceholder = isGrid && thumbnailPlaceholder;
  // 複数列（幅 sm 以上）でカードの上端に枠があるか。マウス端末の操作ボタンはこの枠に重ねる
  const overlayActions = isGrid && (thumbnailSrc !== null || showPlaceholder);
  const trimmedSummary = article.summary?.trim() || '';
  const sourceName = article.companyName ?? article.source?.name ?? '';
  const qualityScore =
    typeof article.qualityScore === 'number' && article.qualityScore > 0
      ? article.qualityScore
      : null;
  // 画像の無い記事の「観測記録」（枠と、1列表示の細い帯）
  const showObservation = showPlaceholder && thumbnailSrc === null;

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
        'group relative flex h-auto cursor-pointer flex-col gap-0 pb-3',
        // グリッドの最低高さ。1列で並べるときに付けると、短い記事でメタ情報の上が空く
        isGrid && 'sm:min-h-[240px]',
        // タイトル Link の擬似要素がカード全面を覆うため、フォーカスリングは
        // コンテナ側で表現する（キーボード操作でどのカードにいるか分かるように）
        'focus-within:ring-2 focus-within:ring-(--tt-color-primary) focus-within:ring-offset-2'
      )}
    >
      {/*
        グリッドではサムネイル枠を 16:9 に固定し、同じ行のカードで高さを揃える。写真は枠
        いっぱいに切り抜き、スライドは文字が欠けないよう全体を収める。1列で全幅に並べる
        画面で 16:9 にすると画像が画面の半分を占めるため、高さ 12rem に収めて全体を出す
      */}
      {thumbnailSrc ? (
        <div
          className={cn(
            'relative isolate w-full overflow-hidden rounded-t-lg bg-(--tt-color-surface-muted)',
            isGrid ? 'aspect-video' : 'h-48'
          )}
        >
          <OptimizedImage
            src={thumbnailSrc}
            alt={article.title}
            fill
            priority={false}
            className={
              isGrid &&
              !isSlideArticle({
                sourceName: article.source?.name,
                url: article.url,
              })
                ? 'object-cover'
                : 'object-contain'
            }
            sizes={isGrid ? THUMBNAIL_SIZES_GRID : THUMBNAIL_SIZES_STACK}
            onError={() => setErroredThumbnail(thumbnailSrc)}
          />
        </div>
      ) : showObservation ? (
        // 画像の無い記事の「観測記録」の枠。同じ 16:9 で行の高さを揃える。揃える相手のいない
        // 1列表示（幅 sm 未満）では出さず、下の細い帯にする。中身はメタ情報の行と重なるので、
        // 枠ごと読み上げから隠す（品質はメタ情報の行で読ませ、画像の有無で読む順番を変えない）
        <div
          className="observation-grid hidden aspect-video w-full flex-col justify-end overflow-hidden rounded-t-lg border-b border-(--tt-color-border) px-4 pb-4 sm:flex"
          aria-hidden="true"
          data-testid="thumbnail-placeholder"
        >
          <p className="font-heading text-foreground truncate text-[22px] leading-7 font-bold [font-stretch:87.5%]">
            {sourceName}
          </p>
          <p className="mt-1 h-4 text-xs leading-4 text-(--tt-color-text-muted)">
            <RelativeTime
              date={article.publishedAt}
              className="after:content-['に公開']"
            />
          </p>
          {qualityScore !== null && (
            <QualityMeter score={qualityScore} className="mt-2 text-xs" />
          )}
        </div>
      ) : null}
      {showObservation && (
        // 1列表示の「観測記録」は、カードの上の1行の細い帯（枠と同じく読み上げから隠す）。
        // 拡大表示などで幅が足りないときは、高さを固定せずに折り返す
        <div
          className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 rounded-t-lg border-b border-(--tt-color-border) bg-(--tt-color-surface-muted) px-4 py-1 text-xs sm:hidden"
          aria-hidden="true"
          data-testid="observation-strip"
        >
          <span className="font-heading text-foreground min-w-0 truncate text-[13px] font-semibold">
            {sourceName}
          </span>
          <span className="shrink-0 text-(--tt-color-text-muted)">
            <RelativeTime
              date={article.publishedAt}
              className="after:content-['に公開']"
            />
          </span>
          {qualityScore !== null && (
            <QualityMeter score={qualityScore} label={false} className="ml-auto" />
          )}
        </div>
      )}

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

        {/* 5列の狭いカードでは翻訳のバッジまで1行に収まらない。ソース名を削らず日付を次の行へ送る。
            印・ソース名・バッジは1つにまとめ、バッジだけが次の行へ離れないようにする */}
        <div className="text-caption mt-auto flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 pt-1">
          <div className="flex min-w-0 items-center gap-2">
            {!isRead && <UnreadDot />}
            {isNew && <NewLabel />}
            {showSource && article.source && (
              <SourceLabel name={article.companyName ?? article.source.name} />
            )}
            {article.translatedTitle && <TranslationBadge compact />}
          </div>
          <span
            className="text-muted-foreground flex shrink-0 items-center gap-1"
            data-testid="article-date"
          >
            <Calendar className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">公開日:</span>
            <span className="tabular-nums">
              {formatDateWithTime(article.publishedAt)}
            </span>
          </span>
          {/* 品質。画像のある記事は目盛りをここに見せる。画像の無い記事は「観測記録」の枠と帯に
              見せ、ここでは読み上げにだけ残す（画像の有無で読む順番を変えない） */}
          {showPlaceholder &&
            qualityScore !== null &&
            (thumbnailSrc !== null ? (
              <QualityMeter score={qualityScore} label={false} />
            ) : (
              <span className="sr-only" data-testid="quality-sr">
                品質 {Math.round(qualityScore)}
              </span>
            ))}
        </div>
      </div>

      {/*
        操作ボタン。タッチ端末（hover できない端末）と1列表示（幅 sm 未満、layout が 'stack'）
        ではカード下端に常に出す。複数列のマウス端末ではサムネイルの枠の右上に重ね、hover か
        キーボードフォーカスで出す。枠が無いカードでは重ねるとタイトルを隠すため、下端に常に出す
      */}
      <div
        className={cn(
          'relative z-10 flex items-center justify-end gap-1 px-4 pt-1 transition-opacity duration-200',
          overlayActions && [
            'sm:[@media(hover:hover)]:absolute sm:[@media(hover:hover)]:top-2 sm:[@media(hover:hover)]:right-2 sm:[@media(hover:hover)]:rounded-full sm:[@media(hover:hover)]:bg-(--tt-color-surface)/85 sm:[@media(hover:hover)]:p-0.5 sm:[@media(hover:hover)]:opacity-0 sm:[@media(hover:hover)]:shadow-sm',
            // 隠しているあいだは押せないようにする（マウスとタッチ両用の端末で、見えないボタンに当たらない）
            'sm:[@media(hover:hover)]:pointer-events-none',
            'group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100',
          ]
        )}
        data-testid="article-actions"
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
