import { Loader2, BarChart3 } from 'lucide-react';
import { StatsOverviewSkeleton } from '@/app/components/stats/stats-overview-skeleton';
import { ChartSkeleton } from '@/app/components/stats/chart-skeleton';
import { SourceChartSkeleton } from '@/app/components/stats/source-chart-skeleton';
import { TagCloudSkeleton } from '@/app/components/stats/tag-cloud-skeleton';

export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          統計情報
        </h1>
        <p className="text-muted-foreground mt-1">
          記事の収集状況とトレンドを可視化
        </p>
      </div>

      <div className="space-y-6">
        {/* 概要スケルトン */}
        <StatsOverviewSkeleton />

        {/* チャートスケルトン */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartSkeleton />
          <SourceChartSkeleton />
        </div>

        {/* タグクラウドスケルトン */}
        <TagCloudSkeleton />
      </div>
    </div>
  );
}