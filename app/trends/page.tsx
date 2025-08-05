'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Sparkles, Calendar, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { TrendLineChart } from '@/app/components/trends/TrendLineChart';
import { SourcePieChart } from '@/app/components/trends/SourcePieChart';
import { TagRankingChart } from '@/app/components/trends/TagRankingChart';

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
    [key: string]: any;
  }>;
  period: {
    from: string;
    to: string;
    days: number;
  };
}

export default function TrendsPage() {
  const [trendingKeywords, setTrendingKeywords] = useState<TrendingKeyword[]>([]);
  const [newTags, setNewTags] = useState<NewTag[]>([]);
  const [trendAnalysis, setTrendAnalysis] = useState<TrendAnalysis | null>(null);
  const [selectedDays, setSelectedDays] = useState(7);
  const [sourceData, setSourceData] = useState<{name: string; value: number; percentage: number}[]>([]);
  
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
        cache: 'force-cache',
        next: { revalidate: 300 } // 5分間キャッシュ
      });
      const data = await response.json();
      setTrendingKeywords(data.trending);
      setNewTags(data.newTags);
    } catch (error) {
      console.error('Failed to fetch trending keywords:', error);
    } finally {
      setLoadingKeywords(false);
    }
  };

  const fetchTrendAnalysis = async (days: number) => {
    try {
      setLoadingAnalysis(true);
      const response = await fetch(`/api/trends/analysis?days=${days}`);
      const data = await response.json();
      setTrendAnalysis(data);
    } catch (error) {
      console.error('Failed to fetch trend analysis:', error);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const fetchSourceStats = async () => {
    try {
      setLoadingSource(true);
      const response = await fetch('/api/stats', {
        cache: 'force-cache',
        next: { revalidate: 300 } // 5分間キャッシュ
      });
      const result = await response.json();
      if (result.success && result.data && result.data.sources) {
        const allSources = result.data.sources;
        
        // 上位6つのソースを取得
        const topSources = allSources.slice(0, 6);
        const otherSources = allSources.slice(6);
        
        // 「その他」の合計を計算
        const othersCount = otherSources.reduce((sum: number, source: any) => sum + source.count, 0);
        const othersPercentage = otherSources.reduce((sum: number, source: any) => sum + source.percentage, 0);
        
        const sourceStats = topSources.map((source: {name: string; count: number; percentage: number}) => ({
          name: source.name,
          value: source.count,
          percentage: source.percentage
        }));
        
        // 「その他」があれば追加
        if (othersCount > 0) {
          sourceStats.push({
            name: 'その他',
            value: othersCount,
            percentage: othersPercentage
          });
        }
        
        setSourceData(sourceStats);
      }
    } catch (error) {
      console.error('Failed to fetch source stats:', error);
    } finally {
      setLoadingSource(false);
    }
  };

  const getGrowthIcon = (rate: number) => {
    if (rate >= 100) return '🚀';
    if (rate >= 50) return '📈';
    if (rate >= 20) return '📊';
    return '📉';
  };

  const getGrowthColor = (rate: number) => {
    if (rate >= 100) return 'text-red-600 dark:text-red-400';
    if (rate >= 50) return 'text-orange-600 dark:text-orange-400';
    if (rate >= 20) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  // グラフデータをメモ化
  const chartData = useMemo(() => ({
    timeline: trendAnalysis?.timeline || [],
    topTags: trendAnalysis?.topTags?.slice(0, 10).map(t => t.name) || [],
    tagRanking: trendAnalysis?.topTags?.slice(0, 10).map(tag => ({
      name: tag.name,
      count: tag.totalCount
    })) || []
  }), [trendAnalysis]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">トレンド分析</h1>
        <p className="text-muted-foreground">
          技術トレンドの変化を可視化し、急上昇キーワードを発見
        </p>
      </div>

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
                    <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
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
                  <div className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getGrowthIcon(keyword.growthRate)}</span>
                      <span className="font-medium">{keyword.name}</span>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-semibold ${getGrowthColor(keyword.growthRate)}`}>
                        +{keyword.growthRate}%
                      </div>
                      <div className="text-xs text-muted-foreground">
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
                    <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
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
                  <div className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <Badge variant="secondary" className="font-medium">
                      {tag.name}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
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
                    <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {trendAnalysis?.topTags?.map((tag, index) => (
                <Link
                  key={tag.name}
                  href={`/?tags=${encodeURIComponent(tag.name)}`}
                  className="block"
                >
                  <div className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-muted-foreground w-6">
                        {index + 1}
                      </span>
                      <span className="font-medium">{tag.name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
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
            <h2 className="text-2xl font-semibold flex items-center gap-2">
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
            <SourcePieChart
              data={sourceData}
              loading={loadingSource}
            />
          </div>
        </div>
      </div>
    </div>
  );
}