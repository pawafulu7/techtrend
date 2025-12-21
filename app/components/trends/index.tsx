'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, BarChart3, PieChart as PieChartIcon } from 'lucide-react';

/**
 * Chart loading skeleton component
 * Provides visual feedback while recharts bundle is loading
 */
const ChartSkeleton = ({ title, icon: Icon }: { title: string; icon: React.ElementType }) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Icon className="h-5 w-5" />
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="flex items-center justify-center h-[300px]">
        <Skeleton className="h-[280px] w-full rounded-lg" />
      </div>
    </CardContent>
  </Card>
);

/**
 * Dynamically imported chart components
 * These are lazy-loaded to reduce initial bundle size by ~400KB (recharts)
 *
 * ssr: false is required because recharts uses ResponsiveContainer
 * which depends on DOM dimensions and would cause hydration issues
 */

export const SourcePieChart = dynamic(
  () => import('./SourcePieChart').then(mod => ({ default: mod.SourcePieChart })),
  {
    loading: () => <ChartSkeleton title="Source Distribution" icon={PieChartIcon} />,
    ssr: false
  }
);

export const TrendLineChart = dynamic(
  () => import('./TrendLineChart').then(mod => ({ default: mod.TrendLineChart })),
  {
    loading: () => <ChartSkeleton title="Tag Trends" icon={TrendingUp} />,
    ssr: false
  }
);

export const TagRankingChart = dynamic(
  () => import('./TagRankingChart').then(mod => ({ default: mod.TagRankingChart })),
  {
    loading: () => <ChartSkeleton title="Tag Rankings" icon={BarChart3} />,
    ssr: false
  }
);
