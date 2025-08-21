import dynamic from 'next/dynamic';
import { AnalyticsSkeleton } from './analytics-skeleton';

const AnalyticsContent = dynamic(
  () => import('./analytics-content'),
  {
    loading: () => <AnalyticsSkeleton />,
    ssr: false
  }
);

export default function AnalyticsPage() {
  return <AnalyticsContent />;
}