import { Suspense } from 'react';
import { StatsClient } from './stats-client';
import { StatsPageSkeleton } from '@/app/components/stats/stats-page-skeleton';

export default function StatsPage() {
  return (
    <Suspense fallback={<StatsPageSkeleton />}>
      <StatsClient />
    </Suspense>
  );
}
