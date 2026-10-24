'use client';

import dynamic from 'next/dynamic';
import { AnalyticsSkeleton } from './analytics-skeleton';

// 読書分析は端末内（IndexedDB）の記録だけを読むので、サーバーでは描かない
const AnalyticsContent = dynamic(() => import('./analytics-content'), {
  loading: () => <AnalyticsSkeleton />,
  ssr: false,
});

export function AnalyticsTab() {
  return <AnalyticsContent />;
}
