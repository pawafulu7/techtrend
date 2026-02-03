'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Sparkles, Calendar, BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
// Dynamic imports for recharts components to reduce initial bundle size
import {
  TrendLineChart,
  SourcePieChart,
  TagRankingChart,
} from '@/app/components/trends';

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

  // 個別のローディング状態
  const [loadingKeywords, setLoadingKeywords] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(true);
  const [loadingSource, setLoadingSource] = useState(true);

  // 初回のみ実行されるAPI
  useEffect(() => {
    fetchTrendingKeywords();
    fetchSourceStats();
  }, []);

  // selectedDaysの変更時のみ実行されるAPI（デバウンス付き）
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchTrendAnalysis(selectedDays);
    }, 300); // 300ms のデバウンス

    return () => clearTimeout(timeoutId);
  }, [selectedDays]);

  const fetchTrendingKeywords = async () => {
    try {
      setLoadingKeywords(true);
      const response = await fetch('/api/trends/keywords', {
        cache: 'no-store', // キャッシュを無効化（サーバー側でRedisキャッシュが効いている）
      });
      const data = await response.json();

      // APIレスポンスの検証とデフォルト値設定
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

  const fetchTrendAnalysis = async (days: number) => {
    try {
      setLoadingAnalysis(true);
      const response = await fetch(`/api/trends/analysis?days=${days}`, {
        cache: 'no-store', // キャッシュを無効化してパラメータを確実に反映
      });
      const data = await response.json();
      setTrendAnalysis(data);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to fetch trend analysis:', error);
      }
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const fetchSourceStats = async () => {
    try {
      setLoadingSource(true);
      const response = await fetch('/api/stats', {
        cache: 'force-cache',
        next: { revalidate: 300 }, // 5分間キャッシュ
      });
      const result = await response.json();
      if (result.success && result.data && result.data.sources) {
        const allSources = result.data.sources;

        // 上位6つのソースを取得
        const topSources = allSources.slice(0, 6);
        const otherSources = allSources.slice(6);

        // 「その他」の合計を計算
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

        // 「その他」があれば追加
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

  const getGrowthIcon = (rate: number) => {
    const levels = [
      { threshold: 100, icon: '🚀', label: '急上昇' },
      { threshold: 50, icon: '📈', label: '上昇' },
      { threshold: 20, icon: '📊', label: '微増' },
      { threshold: -Infinity, icon: '📉', label: '減少' },
    ];

    const level =
      levels.find((l) => rate >= l.threshold) || levels[levels.length - 1];

    return (
      <span
        className="text-lg"
        role="img"
        aria-label={`${level.label}（${rate >= 0 ? '+' : ''}${rate}%）`}
      >
        {level.icon}
        <span className="sr-only">{level.label}</span>
      </span>
    );
  };

  const getGrowthColor = (rate: number) => {
    if (rate >= 100) return 'text-red-600 dark:text-red-400';
    if (rate >= 50) return 'text-orange-600 dark:text-orange-400';
    if (rate >= 20) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-muted-foreground';
  };

  // グラフデータをメモ化
  const chartData = useMemo(
    () => ({
      timeline: trendAnalysis?.timeline || [],
      topTags: trendAnalysis?.topTags?.slice(0, 10).map((t) => t.name) || [],
      tagRanking:
        trendAnalysis?.topTags?.slice(0, 10).map((tag) => ({
          name: tag.name,
          count: tag.totalCount,
        })) || [],
    }),
    [trendAnalysis]
  );

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <PageHeader
        icon={TrendingUp}
        title="トレンド分析"
        description="技術トレンドの変化を可視化し、急上昇キーワードを発見"
        className="mb-8"
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* 急上昇キーワード */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              急上昇キーワード
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingKeywords ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-12 rounded-lg bg-(--tt-color-surface-muted)"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {trendingKeywords.slice(0, 10).map((keyword) => (
                  <Link
                    key={keyword.id}
                    href={`/?tags=${encodeURIComponent(keyword.name)}`}
                    className="block"
                  >
                    <div className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-(--tt-color-surface-hover)">
                      <div className="flex items-center gap-2">
                        {getGrowthIcon(keyword.growthRate)}
                        <span className="font-medium">{keyword.name}</span>
                      </div>
                      <div className="text-right">
                        <div
                          className={`text-sm font-semibold ${getGrowthColor(keyword.growthRate)}`}
                        >
                          {keyword.growthRate >= 0 ? '+' : ''}
                          {keyword.growthRate}%
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {keyword.recentCount}件
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 新着タグ */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              新着タグ
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingKeywords ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-10 rounded-lg bg-(--tt-color-surface-muted)"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {newTags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/?tags=${encodeURIComponent(tag.name)}`}
                    className="block"
                  >
                    <div className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-(--tt-color-surface-hover)">
                      <Badge variant="secondary" className="font-medium">
                        {tag.name}
                      </Badge>
                      <span className="text-muted-foreground text-sm">
                        {tag.count}件
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* トップタグ */}
        <Card className="md:col-span-1 lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              人気タグ TOP10
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAnalysis ? (
              <div className="space-y-2">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-8 rounded-lg bg-(--tt-color-surface-muted)"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {trendAnalysis?.topTags?.slice(0, 10).map((tag, index) => (
                  <Link
                    key={tag.name}
                    href={`/?tags=${encodeURIComponent(tag.name)}`}
                    className="block"
                  >
                    <div className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-(--tt-color-surface-hover)">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-6 text-sm font-semibold">
                          {index + 1}
                        </span>
                        <span className="font-medium">{tag.name}</span>
                      </div>
                      <span className="text-muted-foreground text-sm">
                        {tag.totalCount}件
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* グラフセクション */}
      <div className="mt-6 space-y-6">
        {/* タグトレンドグラフ */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-2xl font-semibold">
              <Calendar className="h-6 w-6" />
              詳細分析
            </h2>
            <div className="flex gap-2">
              {[7, 14, 30].map((days) => (
                <Button
                  key={days}
                  variant={selectedDays === days ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedDays(days)}
                >
                  {days}日間
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* タグトレンドの時系列グラフ */}
            <div className="lg:col-span-2">
              <TrendLineChart
                data={chartData.timeline}
                tags={chartData.topTags}
                loading={loadingAnalysis}
              />
            </div>

            {/* タグランキングバーグラフ */}
            <TagRankingChart
              data={chartData.tagRanking}
              loading={loadingAnalysis}
            />

            {/* ソース別円グラフ */}
            <SourcePieChart data={sourceData} loading={loadingSource} />
          </div>
        </div>
      </div>
    </div>
  );
}
