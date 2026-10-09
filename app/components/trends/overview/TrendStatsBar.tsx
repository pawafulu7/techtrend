import { TrendingUp, Sparkles, BarChart3 } from 'lucide-react';

interface TrendStatsBarProps {
  /** null は取得に失敗した値。0 と区別して「—」で表す（issue #701） */
  trendingCount: number | null;
  newTagCount: number | null;
  topTagCount: number | null;
  loading?: boolean;
}

function StatValue({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="text-sm font-semibold">
        <span aria-hidden="true">—</span>
        <span className="sr-only">取得できませんでした</span>
      </span>
    );
  }
  return <span className="text-sm font-semibold">{value}</span>;
}

export function TrendStatsBar({
  trendingCount,
  newTagCount,
  topTagCount,
  loading = false,
}: TrendStatsBarProps) {
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
        <TrendingUp className="text-tt-primary h-4 w-4" />
        <StatValue value={trendingCount} />
        <span className="text-muted-foreground text-xs">急上昇</span>
      </div>
      <div className="bg-border hidden h-4 w-px sm:block" />
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-(--tt-color-positive)" />
        <StatValue value={newTagCount} />
        <span className="text-muted-foreground text-xs">新着タグ</span>
      </div>
      <div className="bg-border hidden h-4 w-px sm:block" />
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-(--tt-color-info)" />
        <StatValue value={topTagCount} />
        <span className="text-muted-foreground text-xs">人気タグ</span>
      </div>
    </div>
  );
}
