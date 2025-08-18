import { Suspense } from 'react';
import { StatsClient } from './stats-client';
import { BarChart3 } from 'lucide-react';
import { StatsOverviewSkeleton } from '@/app/components/stats/stats-overview-skeleton';

export default function StatsPage() {

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

      <Suspense fallback={<StatsOverviewSkeleton />}>
        <StatsClient />
      </Suspense>
    </div>
  );
}