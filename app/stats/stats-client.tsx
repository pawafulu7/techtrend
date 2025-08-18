'use client';

import { useEffect, useState } from 'react';
import { StatsOverview } from '@/app/components/stats/overview';
import { SourceChart } from '@/app/components/stats/source-chart';
import { DailyChart } from '@/app/components/stats/daily-chart';
import { TagCloud } from '@/app/components/stats/tag-cloud';
import { StatsOverviewSkeleton } from '@/app/components/stats/stats-overview-skeleton';
import { ChartSkeleton } from '@/app/components/stats/chart-skeleton';
import { TagCloudSkeleton } from '@/app/components/stats/tag-cloud-skeleton';

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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (error) {
    return (
      <div className="text-center text-red-500 py-8">
        エラーが発生しました: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 概要 */}
      {loading ? (
        <StatsOverviewSkeleton />
      ) : stats ? (
        <div className="animate-in fade-in-0 duration-500">
          <StatsOverview stats={stats.overview} />
        </div>
      ) : null}

      {/* チャート */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 日別推移 */}
        {loading ? (
          <ChartSkeleton />
        ) : stats ? (
          <div className="animate-in fade-in-0 duration-500 delay-100">
            <DailyChart data={stats.daily} />
          </div>
        ) : null}

        {/* ソース別分布 */}
        {loading ? (
          <ChartSkeleton />
        ) : stats ? (
          <div className="animate-in fade-in-0 duration-500 delay-150">
            <SourceChart data={stats.sources} />
          </div>
        ) : null}
      </div>

      {/* タグクラウド */}
      {loading ? (
        <TagCloudSkeleton />
      ) : stats ? (
        <div className="animate-in fade-in-0 duration-500 delay-200">
          <TagCloud tags={stats.tags} />
        </div>
      ) : null}
    </div>
  );
}