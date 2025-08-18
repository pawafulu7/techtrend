'use client';

import { useEffect, useState } from 'react';
import { StatsOverview } from '@/app/components/stats/overview';
import { SourceChart } from '@/app/components/stats/source-chart';
import { DailyChart } from '@/app/components/stats/daily-chart';
import { TagCloud } from '@/app/components/stats/tag-cloud';
import { StatsOverviewSkeleton } from '@/app/components/stats/stats-overview-skeleton';
import { ChartSkeleton } from '@/app/components/stats/chart-skeleton';
import { SourceChartSkeleton } from '@/app/components/stats/source-chart-skeleton';
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
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      try {
        // 少し遅延を入れて、スケルトンを見せる
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const response = await fetch('/api/stats');
        if (!response.ok) {
          throw new Error('Failed to fetch stats');
        }
        const result = await response.json();
        
        // データをセット
        setStats(result.data);
        
        // トランジション開始
        setIsTransitioning(true);
        
        // スムーズなトランジションのために2フレーム待つ
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setLoading(false);
          });
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
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
      ) : (
        stats && <StatsOverview stats={stats.overview} />
      )}

      {/* チャート */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 日別推移 */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          stats && <DailyChart data={stats.daily} />
        )}

        {/* ソース別分布 */}
        {loading ? (
          <SourceChartSkeleton />
        ) : (
          stats && <SourceChart data={stats.sources} />
        )}
      </div>

      {/* タグクラウド */}
      {loading ? (
        <TagCloudSkeleton />
      ) : (
        stats && <TagCloud tags={stats.tags} />
      )}
    </div>
  );
}