import { Suspense } from 'react';
import { StatsClient } from './stats-client';
import { BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import { StatsPageSkeleton } from '@/app/components/stats/stats-page-skeleton';

export default function StatsPage() {
  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto max-w-6xl space-y-8 px-4 py-6">
        <PageHeader
          icon={BarChart3}
          title="統計情報"
          description="記事の収集状況とトレンドを可視化"
        />

        <Suspense fallback={<StatsPageSkeleton />}>
          <StatsClient />
        </Suspense>
      </div>
    </div>
  );
}
