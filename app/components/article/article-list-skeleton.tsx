import { Skeleton } from '@/components/ui/skeleton';
import { CardV2 } from '@/components/ui-v2/card-v2';
import type { ViewMode } from '@/types/components';
import { LoadingOverlay } from '@/app/components/common/loading-overlay';
import { ARTICLE_GRID_CLASS } from './article-grid';

// 記事一覧の読み込み中の表示（issue #701）。カード（card.tsx）・リスト（list-item.tsx）・
// コンパクト（compact-card.tsx）の寸法をなぞり、読み込み後に一覧の位置がずれないようにする

function CardSkeleton({ thumbnail }: { thumbnail: boolean }) {
  return (
    <CardV2 className="gap-0 pb-3 sm:min-h-[240px]">
      {/* 1列表示（幅 sm 未満）では画像の無い記事に枠を出さないので、スケルトンも出さない */}
      {thumbnail && (
        <Skeleton className="hidden aspect-video w-full rounded-none rounded-t-lg sm:block" />
      )}
      <div className="flex flex-1 flex-col gap-1.5 px-4 pt-3">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-2/3" />
        <div className="mt-1 space-y-1.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
        <div className="mt-auto flex items-center gap-2 pt-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </CardV2>
  );
}

function ListItemSkeleton() {
  return (
    <div className="rounded-lg border border-(--tt-color-border) bg-(--tt-color-surface) p-3">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="mt-1.5 h-3.5 w-full" />
      <div className="mt-2 flex items-center gap-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

function CompactCardSkeleton() {
  return (
    <CardV2 className="min-h-[140px] gap-2 p-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="mt-auto flex items-center gap-2">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-3 w-12" />
      </div>
    </CardV2>
  );
}

interface ArticleListSkeletonProps {
  viewMode?: ViewMode;
  /** 論文のように画像がほぼ無い一覧では、サムネイルの枠を出さない */
  thumbnail?: boolean;
  /** スピナーに添える文言 */
  label?: string;
  className?: string;
}

export function ArticleListSkeleton({
  viewMode = 'card',
  thumbnail = true,
  label = '記事を読み込んでいます...',
  className,
}: ArticleListSkeletonProps) {
  const isList = viewMode === 'list';
  const count = isList ? 8 : 10;

  return (
    <LoadingOverlay message={label} className={className}>
      <div className={isList ? 'space-y-2' : ARTICLE_GRID_CLASS}>
        {Array.from({ length: count }).map((_, i) =>
          isList ? (
            <ListItemSkeleton key={i} />
          ) : viewMode === 'compact' ? (
            <CompactCardSkeleton key={i} />
          ) : (
            <CardSkeleton key={i} thumbnail={thumbnail} />
          )
        )}
      </div>
    </LoadingOverlay>
  );
}
