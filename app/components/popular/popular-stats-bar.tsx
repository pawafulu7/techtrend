import { TrendingUp, Bookmark, Star } from 'lucide-react';

interface PopularStatsBarProps {
  articleCount: number;
  topScore: number;
  totalBookmarks: number;
  loading?: boolean;
}

export function PopularStatsBar({
  articleCount,
  topScore,
  totalBookmarks,
  loading = false,
}: PopularStatsBarProps) {
  if (loading) {
    return (
      <div className="bg-background animate-pulse rounded-lg border px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <div className="h-4 w-20 rounded bg-(--tt-color-surface-muted)" />
          <div className="bg-border hidden h-4 w-px sm:block" />
          <div className="h-4 w-20 rounded bg-(--tt-color-surface-muted)" />
          <div className="bg-border hidden h-4 w-px sm:block" />
          <div className="h-4 w-20 rounded bg-(--tt-color-surface-muted)" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background flex flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-lg border px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-(--tt-color-primary)" />
        <span className="text-sm font-semibold">{articleCount}</span>
        <span className="text-muted-foreground text-xs">ランキング</span>
      </div>
      <div className="bg-border hidden h-4 w-px sm:block" />
      <div className="flex items-center gap-2">
        <Star className="h-4 w-4 text-(--tt-color-secondary)" />
        <span className="text-sm font-semibold">{Math.round(topScore)}</span>
        <span className="text-muted-foreground text-xs">最高スコア</span>
      </div>
      <div className="bg-border hidden h-4 w-px sm:block" />
      <div className="flex items-center gap-2">
        <Bookmark className="h-4 w-4 text-(--tt-color-info)" />
        <span className="text-sm font-semibold">
          {totalBookmarks.toLocaleString()}
        </span>
        <span className="text-muted-foreground text-xs">総ブックマーク</span>
      </div>
    </div>
  );
}
