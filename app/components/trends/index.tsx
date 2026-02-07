'use client';

import dynamic from 'next/dynamic';
import type { ElementType } from 'react';
import { TrendingUp, PieChart as PieChartIcon } from 'lucide-react';

/**
 * Chart loading skeleton component
 * Provides visual feedback while recharts bundle is loading
 */
const ChartSkeleton = ({
  title,
  icon: Icon,
}: {
  title: string;
  icon: ElementType;
}) => (
  <div className="bg-background rounded-lg border p-4 shadow-sm">
    <div className="mb-3 flex items-center gap-2">
      <Icon className="text-muted-foreground h-4 w-4" />
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
    <div className="h-[300px] animate-pulse rounded bg-(--tt-color-surface-muted)" />
  </div>
);

/**
 * Dynamically imported chart components
 * These are lazy-loaded to reduce initial bundle size by ~400KB (recharts)
 *
 * ssr: false is required because recharts uses ResponsiveContainer
 * which depends on DOM dimensions and would cause hydration issues
 */

export const SourcePieChart = dynamic(
  () =>
    import('./SourcePieChart').then((mod) => ({ default: mod.SourcePieChart })),
  {
    loading: () => (
      <ChartSkeleton title="ソース別記事分布" icon={PieChartIcon} />
    ),
    ssr: false,
  }
);

export const TrendLineChart = dynamic(
  () =>
    import('./TrendLineChart').then((mod) => ({ default: mod.TrendLineChart })),
  {
    loading: () => (
      <ChartSkeleton title="タグトレンドの推移" icon={TrendingUp} />
    ),
    ssr: false,
  }
);
