import { StatsOverviewSkeleton } from './stats-overview-skeleton';
import { ChartSkeleton } from './chart-skeleton';
import { SourceChartSkeleton } from './source-chart-skeleton';
import { TagCloudSkeleton } from './tag-cloud-skeleton';

export function StatsPageSkeleton() {
  return (
    <div className="space-y-8">
      <StatsOverviewSkeleton />

      <section>
        <div className="mb-4 flex items-center gap-2">
          <div className="h-px flex-1 bg-gradient-to-r from-(--tt-color-info)/50 to-transparent" />
          <div className="h-3 w-16 animate-pulse rounded bg-(--tt-color-surface-muted)" />
          <div className="h-px flex-1 bg-gradient-to-l from-(--tt-color-info)/50 to-transparent" />
        </div>

        <div className="space-y-6">
          <ChartSkeleton />
          <div className="grid gap-6 lg:grid-cols-2">
            <SourceChartSkeleton />
            <TagCloudSkeleton />
          </div>
        </div>
      </section>
    </div>
  );
}
