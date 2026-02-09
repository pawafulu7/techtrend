'use client';

import { useEffect, useState, useMemo } from 'react';
import { StatsOverview } from '@/app/components/stats/overview';
import { SourceChart } from '@/app/components/stats/source-chart';
import { DailyChart } from '@/app/components/stats/daily-chart';
import { TagCloud } from '@/app/components/stats/tag-cloud';
import { StatsPageSkeleton } from '@/app/components/stats/stats-page-skeleton';

interface StatsData {
  overview: {
    total: number;
    last7Days: number;
    last30Days: number;
    averagePerDay: number;
  };
  sources: Array<{
    id: string;
    name: string;
    count: number;
    percentage: number;
  }>;
  daily: Array<{
    date: string;
    total: number;
    sources: Record<string, number>;
  }>;
  tags: Array<{
    id: string;
    name: string;
    count: number;
  }>;
}

export function StatsClient() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/stats');
        if (!response.ok) {
          throw new Error('Failed to fetch stats');
        }
        const result = await response.json();

        setStats(result.data);

        // Wait for two animation frames so the browser paints the skeleton
        // before swapping to the real content, avoiding a flash of unstyled layout.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setLoading(false);
          });
        });
      } catch (error) {
        setError(error instanceof Error ? error.message : 'An error occurred');
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const groupedSources = useMemo(() => {
    if (!stats) return [];
    const topSources = stats.sources.filter((s) => s.percentage >= 1.0);
    const otherSources = stats.sources.filter((s) => s.percentage < 1.0);
    if (otherSources.length === 0) return topSources;
    const othersCount = otherSources.reduce((sum, s) => sum + s.count, 0);
    const topPercentage = topSources.reduce((sum, s) => sum + s.percentage, 0);
    const othersPercentage = Math.max(0, 100 - topPercentage);
    return [
      ...topSources,
      {
        id: '_others',
        name: `その他 (${otherSources.length}件)`,
        count: othersCount,
        percentage: othersPercentage,
      },
    ];
  }, [stats]);

  if (error) {
    return (
      <div className="text-destructive py-8 text-center">
        エラーが発生しました: {error}
      </div>
    );
  }

  if (loading) {
    return <StatsPageSkeleton />;
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="space-y-8">
      <StatsOverview stats={stats.overview} />

      <DailyChart data={stats.daily} />

      <div className="grid gap-6 lg:grid-cols-2">
        <SourceChart data={groupedSources} />
        <TagCloud tags={stats.tags} />
      </div>
    </div>
  );
}
