import { StatsOverviewSkeleton } from './stats-overview-skeleton';
import { ChartSkeleton } from './chart-skeleton';
import { SourceChartSkeleton } from './source-chart-skeleton';
import { TagCloudSkeleton } from './tag-cloud-skeleton';

export function StatsPageSkeleton() {
  return (
    <div className="space-y-8">
      <StatsOverviewSkeleton />
      <ChartSkeleton />
      <div className="grid gap-6 lg:grid-cols-2">
        <SourceChartSkeleton />
        <TagCloudSkeleton />
      </div>
    </div>
  );
}
