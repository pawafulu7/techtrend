import { Suspense } from 'react';
import { StatsClient } from './stats-client';
import { StatsPageSkeleton } from '@/app/components/stats/stats-page-skeleton';

export default function StatsPage() {
  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
        <Suspense fallback={<StatsPageSkeleton />}>
          <StatsClient />
        </Suspense>
      </div>
    </div>
  );
}
