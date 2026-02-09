'use client';

import { useEffect, useState, useMemo } from 'react';
import { CalendarDays, BarChart3 } from 'lucide-react';
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
        await new Promise((resolve) => setTimeout(resolve, 300));

        const response = await fetch('/api/stats');
        if (!response.ok) {
          throw new Error('Failed to fetch stats');
        }
        const result = await response.json();

        setStats(result.data);

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
    const topSources = stats.sources.filter((s) => s.percentage >= 1);
    const otherSources = stats.sources.filter((s) => s.percentage < 1);
    if (otherSources.length === 0) return topSources;
    const othersCount = otherSources.reduce((sum, s) => sum + s.count, 0);
    const othersPercentage = otherSources.reduce(
      (sum, s) => sum + s.percentage,
      0
    );
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

  return (
    <div className="space-y-8">
      {stats && <StatsOverview stats={stats.overview} />}

      <section>
        <div className="mb-4 flex items-center gap-2">
          <div className="h-px flex-1 bg-gradient-to-r from-(--tt-color-info)/50 to-transparent" />
          <h2 className="text-muted-foreground flex items-center gap-1.5 px-2 text-xs font-bold tracking-widest">
            <CalendarDays className="h-3.5 w-3.5" />
            チャート
          </h2>
          <div className="h-px flex-1 bg-gradient-to-l from-(--tt-color-info)/50 to-transparent" />
        </div>

        <div className="space-y-6">
          {stats && <DailyChart data={stats.daily} />}

          <div className="grid gap-6 lg:grid-cols-2">
            <SourceChart data={groupedSources} />

            <section>
              <div className="mb-4 flex items-center gap-2">
                <div className="h-px flex-1 bg-gradient-to-r from-(--tt-color-primary)/30 to-transparent" />
                <h2 className="text-muted-foreground flex items-center gap-1.5 px-2 text-xs font-bold tracking-widest">
                  <BarChart3 className="h-3.5 w-3.5" />
                  タグ
                </h2>
                <div className="h-px flex-1 bg-gradient-to-l from-(--tt-color-primary)/30 to-transparent" />
              </div>
              {stats && <TagCloud tags={stats.tags} />}
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
