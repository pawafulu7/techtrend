'use client';

import { useState, useEffect, useMemo } from 'react';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { TrendingUp, Sparkles, BarChart3, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { TrendLineChart, SourcePieChart } from '@/app/components/trends';
import {
  TrendingKeywordCard,
  TrendingKeywordCardSkeleton,
} from '@/app/components/trends/overview/TrendingKeywordCard';
import { TrendStatsBar } from '@/app/components/trends/overview/TrendStatsBar';
import { TrendNavigationCards } from '@/app/components/trends/overview/TrendNavigationCards';

interface TrendingKeyword {
  id: string;
  name: string;
  recentCount: number;
  weeklyAverage: number;
  growthRate: number;
  isTrending: boolean;
}

interface NewTag {
  id: string;
  name: string;
  count: number;
}

interface TrendAnalysis {
  topTags: { name: string; totalCount: number }[];
  timeline: Array<{
    date: string;
    [key: string]: string | number;
  }>;
  period: {
    from: string;
    to: string;
    days: number;
  };
}

export default function TrendsPage() {
  const [trendingKeywords, setTrendingKeywords] = useState<TrendingKeyword[]>(
    []
  );
  const [newTags, setNewTags] = useState<NewTag[]>([]);
  const [trendAnalysis, setTrendAnalysis] = useState<TrendAnalysis | null>(
    null
  );
  const [selectedDays, setSelectedDays] = useState(7);
  const [sourceData, setSourceData] = useState<
    { name: string; value: number; percentage: number }[]
  >([]);

  const [loadingKeywords, setLoadingKeywords] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(true);
  const [loadingSource, setLoadingSource] = useState(true);

  useEffect(() => {
    fetchTrendingKeywords();
    fetchSourceStats();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      fetchTrendAnalysis(selectedDays, controller.signal);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [selectedDays]);

  const fetchTrendingKeywords = async () => {
    try {
      setLoadingKeywords(true);
      const response = await fetch('/api/trends/keywords', {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      if (data.error) {
        setTrendingKeywords([]);
        setNewTags([]);
      } else {
        setTrendingKeywords(data.trending || []);
        setNewTags(data.newTags || []);
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to fetch trending keywords:', error);
      }
      setTrendingKeywords([]);
      setNewTags([]);
    } finally {
      setLoadingKeywords(false);
    }
  };

  const fetchTrendAnalysis = async (days: number, signal?: AbortSignal) => {
    try {
      setLoadingAnalysis(true);
      const response = await fetch(`/api/trends/analysis?days=${days}`, {
        cache: 'no-store',
        signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.error) {
        setTrendAnalysis(null);
      } else {
        setTrendAnalysis(data);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to fetch trend analysis:', error);
      }
      setTrendAnalysis(null);
    } finally {
      if (!signal?.aborted) {
        setLoadingAnalysis(false);
      }
    }
  };

  const fetchSourceStats = async () => {
    try {
      setLoadingSource(true);
      const response = await fetch('/api/stats', {
        cache: 'force-cache',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (result.success && result.data && result.data.sources) {
        const allSources = result.data.sources;
        const topSources = allSources.slice(0, 6);
        const otherSources = allSources.slice(6);

        const othersCount = otherSources.reduce(
          (sum: number, source: { count: number }) => sum + source.count,
          0
        );
        const othersPercentage = otherSources.reduce(
          (sum: number, source: { percentage: number }) =>
            sum + source.percentage,
          0
        );

        const sourceStats = topSources.map(
          (source: { name: string; count: number; percentage: number }) => ({
            name: source.name,
            value: source.count,
            percentage: source.percentage,
          })
        );

        if (othersCount > 0) {
          sourceStats.push({
            name: 'その他',
            value: othersCount,
            percentage: othersPercentage,
          });
        }

        setSourceData(sourceStats);
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to fetch source stats:', error);
      }
    } finally {
      setLoadingSource(false);
    }
  };

  const chartData = useMemo(
    () => ({
      timeline: trendAnalysis?.timeline || [],
      topTags: trendAnalysis?.topTags?.slice(0, 10).map((t) => t.name) || [],
    }),
    [trendAnalysis]
  );

  return (
    <div className="from-background to-muted/20 min-h-screen bg-gradient-to-b">
      <div className="container mx-auto max-w-6xl space-y-8 px-4 py-6">
        <h1 className="sr-only">トレンド概要</h1>

        {/* Stats Bar */}
        <TrendStatsBar
          trendingCount={trendingKeywords.length}
          newTagCount={newTags.length}
          topTagCount={trendAnalysis?.topTags?.length ?? 0}
          loading={loadingKeywords || loadingAnalysis}
        />

        {/* Trending Keywords Section */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-(--tt-color-secondary)/50 to-transparent" />
            <h2 className="text-muted-foreground flex items-center gap-1.5 px-2 text-xs font-bold tracking-widest">
              <TrendingUp className="h-3.5 w-3.5" />
              急上昇キーワード
            </h2>
            <div className="h-px flex-1 bg-gradient-to-l from-(--tt-color-secondary)/50 to-transparent" />
          </div>

          {loadingKeywords ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[...Array(6)].map((_, i) => (
                <TrendingKeywordCardSkeleton key={i} />
              ))}
            </div>
          ) : trendingKeywords.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {trendingKeywords.slice(0, 8).map((keyword) => (
                <TrendingKeywordCard key={keyword.id} keyword={keyword} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-4 text-center text-sm">
              急上昇キーワードはありません
            </p>
          )}
        </section>

        {/* New Tags Section */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-(--tt-color-positive)" />
            <h2 className="text-muted-foreground text-xs font-medium tracking-wide">
              新着タグ ({newTags.length})
            </h2>
          </div>

          {loadingKeywords ? (
            <div className="flex flex-wrap gap-2">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="h-7 w-20 animate-pulse rounded-full bg-(--tt-color-surface-muted)"
                />
              ))}
            </div>
          ) : newTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {newTags.map((tag) => (
                <BadgeV2 key={tag.id} variant="positive" asChild>
                  <Link href={`/?tags=${encodeURIComponent(tag.name)}`}>
                    {tag.name}
                    <span className="ml-1 opacity-70">{tag.count}</span>
                  </Link>
                </BadgeV2>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-2 text-center text-sm">
              新着タグはありません
            </p>
          )}
        </section>

        {/* Sub-page Navigation */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-(--tt-color-primary)/30 to-transparent" />
            <h2 className="text-muted-foreground px-2 text-xs font-bold tracking-widest">
              詳細レポート
            </h2>
            <div className="h-px flex-1 bg-gradient-to-l from-(--tt-color-primary)/30 to-transparent" />
          </div>
          <TrendNavigationCards />
        </section>

        {/* Analysis Section */}
        <section className="border-t pt-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-muted-foreground text-xs font-bold tracking-widest">
              分析
            </h2>
            <div
              className="flex gap-1.5"
              role="group"
              aria-label="分析期間の選択"
            >
              {[7, 14, 30].map((days) => (
                <Button
                  key={days}
                  variant={selectedDays === days ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedDays(days)}
                  aria-pressed={selectedDays === days}
                  className="h-7 px-3 text-xs"
                >
                  {days}日間
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            {/* Trend Line Chart */}
            <TrendLineChart
              data={chartData.timeline}
              tags={chartData.topTags}
              loading={loadingAnalysis}
            />

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Top Tags List */}
              <div className="bg-background rounded-lg border p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-(--tt-color-info)" />
                  <h3 className="text-sm font-semibold">人気タグ TOP10</h3>
                </div>
                {loadingAnalysis ? (
                  <div className="space-y-2">
                    {[...Array(10)].map((_, i) => (
                      <div
                        key={i}
                        className="h-8 animate-pulse rounded bg-(--tt-color-surface-muted)"
                      />
                    ))}
                  </div>
                ) : trendAnalysis?.topTags &&
                  trendAnalysis.topTags.length > 0 ? (
                  <div className="space-y-1">
                    {trendAnalysis.topTags.slice(0, 10).map((tag, index) => (
                      <Link
                        key={tag.name}
                        href={`/?tags=${encodeURIComponent(tag.name)}`}
                        className="group flex items-center gap-3 rounded px-2 py-1.5 transition-colors hover:bg-(--tt-color-surface-hover) focus-visible:ring-2 focus-visible:ring-(--tt-color-primary) focus-visible:outline-none"
                      >
                        <span className="text-muted-foreground w-5 text-xs font-semibold">
                          {index + 1}
                        </span>
                        <span className="flex-1 truncate text-sm font-medium">
                          {tag.name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {tag.totalCount}件
                        </span>
                        <ArrowUpRight className="text-muted-foreground h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground flex h-20 items-center justify-center text-sm">
                    データがありません
                  </p>
                )}
              </div>

              {/* Source Pie Chart */}
              <SourcePieChart data={sourceData} loading={loadingSource} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
