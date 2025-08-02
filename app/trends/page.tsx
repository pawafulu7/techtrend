'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Sparkles, Calendar, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

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
    tags: Record<string, number>;
  }>;
}

export default function TrendsPage() {
  const [trendingKeywords, setTrendingKeywords] = useState<TrendingKeyword[]>([]);
  const [newTags, setNewTags] = useState<NewTag[]>([]);
  const [trendAnalysis, setTrendAnalysis] = useState<TrendAnalysis | null>(null);
  const [selectedDays, setSelectedDays] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrendingKeywords();
    fetchTrendAnalysis(selectedDays);
  }, [selectedDays]);

  const fetchTrendingKeywords = async () => {
    try {
      const response = await fetch('/api/trends/keywords');
      const data = await response.json();
      setTrendingKeywords(data.trending);
      setNewTags(data.newTags);
    } catch (error) {
      console.error('Failed to fetch trending keywords:', error);
    }
  };

  const fetchTrendAnalysis = async (days: number) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/trends/analysis?days=${days}`);
      const data = await response.json();
      setTrendAnalysis(data);
    } catch (error) {
      console.error('Failed to fetch trend analysis:', error);
    } finally {
      setLoading(false);
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
          </CardContent>
        </Card>
      </div>

      {/* タグトレンドグラフ */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              タグトレンドの推移
            </CardTitle>
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
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              読み込み中...
            </div>
          ) : trendAnalysis?.timeline && trendAnalysis.timeline.length > 0 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 mb-4">
                {trendAnalysis.topTags.map((tag, index) => (
                  <Badge
                    key={tag.name}
                    variant="outline"
                    className="flex items-center gap-1"
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: `hsl(${index * 36}, 70%, 50%)`
                      }}
                    />
                    {tag.name}
                  </Badge>
                ))}
              </div>
              <div className="h-64 relative">
                {/* 簡易的なグラフ表示 */}
                <div className="text-sm text-muted-foreground">
                  ※ グラフ表示は実装を簡略化しています。
                  実際の実装では、RechartsやChart.jsなどのライブラリを使用してください。
                </div>
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              データがありません
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}