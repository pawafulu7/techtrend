import { BarChart3, Calendar, Activity, TrendingUp } from 'lucide-react';

interface StatsOverviewProps {
  stats: {
    total: number;
    last7Days: number;
    last30Days: number;
    averagePerDay: number;
  };
}

export function StatsOverview({ stats }: StatsOverviewProps) {
  const growthRate =
    stats.last7Days > 0 && stats.averagePerDay > 0
      ? Math.round((stats.last7Days / 7 / stats.averagePerDay - 1) * 100)
      : 0;

  return (
    <div className="bg-background flex flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-lg border px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-(--tt-color-primary)" />
        <span className="text-sm font-semibold">
          {stats.total.toLocaleString()}
        </span>
        <span
          className="text-muted-foreground text-xs"
          aria-label="全期間の総記事数"
        >
          総記事数
        </span>
      </div>
      <div className="bg-border hidden h-4 w-px sm:block" />
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-(--tt-color-secondary)" />
        <span className="text-sm font-semibold">
          {stats.last7Days.toLocaleString()}
        </span>
        <span
          className="text-muted-foreground text-xs"
          aria-label="過去7日間の記事数"
        >
          週間
        </span>
      </div>
      <div className="bg-border hidden h-4 w-px sm:block" />
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-(--tt-color-info)" />
        <span className="text-sm font-semibold">
          {stats.last30Days.toLocaleString()}
        </span>
        <span
          className="text-muted-foreground text-xs"
          aria-label="過去30日間の記事数"
        >
          月間
        </span>
      </div>
      <div className="bg-border hidden h-4 w-px sm:block" />
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-(--tt-color-positive)" />
        <span className="text-sm font-semibold">
          {growthRate > 0 ? '+' : ''}
          {growthRate}%
        </span>
        <span
          className="text-muted-foreground text-xs"
          aria-label="平均比（過去7日間）"
        >
          成長率
        </span>
      </div>
    </div>
  );
}
