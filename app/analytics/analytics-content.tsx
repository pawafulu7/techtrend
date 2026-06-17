'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui-v2/card-v2';
import { Button } from '@/components/ui-v2/button-v2';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { analyticsTracker, ReadingStats } from '@/lib/analytics/tracking';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  BookOpen,
  Clock,
  TrendingUp,
  Target,
  Download,
  AlertCircle,
} from 'lucide-react';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { AnalyticsSettings } from '@/app/components/analytics/AnalyticsSettings';

// グラフの色設定
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function AnalyticsContent() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [stats, setStats] = useState<ReadingStats[]>([]);
  const [dateRange, setDateRange] = useState<'week' | 'month'>('week');
  const [loading, setLoading] = useState(true);

  const checkAnalyticsStatus = useCallback(() => {
    const enabled = localStorage.getItem('analytics-enabled') === 'true';
    setIsEnabled(enabled);
    setLoading(false);
  }, []);

  const loadStats = useCallback(async () => {
    const now = new Date();
    let from: Date, to: Date;

    if (dateRange === 'week') {
      from = startOfWeek(now, { locale: ja });
      to = endOfWeek(now, { locale: ja });
    } else {
      from = startOfMonth(now);
      to = endOfMonth(now);
    }

    const data = await analyticsTracker.getStats({ from, to });
    setStats(data || []);
  }, [dateRange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async callback updates state on mount
    checkAnalyticsStatus();
  }, [checkAnalyticsStatus]);

  useEffect(() => {
    if (isEnabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async callback updates state on dateRange change
      loadStats();
    }
  }, [isEnabled, dateRange, loadStats]);

  const enableAnalytics = async () => {
    await analyticsTracker.enable();
    setIsEnabled(true);
  };

  const exportData = async () => {
    const data = await analyticsTracker.exportData();
    if (!data) return;

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `techtrend-analytics-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 統計の集計
  const aggregatedStats = stats.reduce(
    (acc, stat) => {
      acc.totalArticles += stat.totalArticles;
      acc.totalTime += stat.totalTime;
      acc.completedArticles += stat.completedArticles;

      // タグ分布の集計
      Object.entries(stat.tagDistribution).forEach(([tag, count]) => {
        acc.tagDistribution[tag] = (acc.tagDistribution[tag] || 0) + count;
      });

      // ソース分布の集計
      Object.entries(stat.sourceDistribution).forEach(([source, count]) => {
        acc.sourceDistribution[source] =
          (acc.sourceDistribution[source] || 0) + count;
      });

      // 時間帯分布の集計
      stat.hourlyDistribution.forEach((count, hour) => {
        acc.hourlyDistribution[hour] += count;
      });

      return acc;
    },
    {
      totalArticles: 0,
      totalTime: 0,
      completedArticles: 0,
      tagDistribution: {} as Record<string, number>,
      sourceDistribution: {} as Record<string, number>,
      hourlyDistribution: new Array(24).fill(0),
    }
  );

  // グラフ用データの準備
  const tagData = Object.entries(aggregatedStats.tagDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));

  const sourceData = Object.entries(aggregatedStats.sourceDistribution).map(
    ([name, value]) => ({ name, value })
  );

  const hourlyData = aggregatedStats.hourlyDistribution.map((value, hour) => ({
    hour: `${hour}時`,
    value,
  }));

  const dailyData = stats.map((stat) => ({
    date: format(new Date(stat.date), 'MM/dd', { locale: ja }),
    articles: stat.totalArticles,
    time: stat.totalTime,
  }));

  if (loading) {
    return (
      <div
        data-testid="loading-spinner"
        className="container mx-auto px-4 py-8"
      >
        <div className="flex h-64 items-center justify-center">
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2"></div>
        </div>
      </div>
    );
  }

  if (!isEnabled) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              読書分析機能が無効です
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              読書分析機能を有効にすると、あなたの読書傾向を分析し、
              学習パターンを可視化できます。
            </p>
            <ul className="text-muted-foreground list-inside list-disc space-y-2 text-sm">
              <li>読書時間と記事数の追跡</li>
              <li>興味分野の可視化</li>
              <li>学習進捗の確認</li>
              <li>すべてのデータはローカルに保存されます</li>
            </ul>
            <Button onClick={enableAnalytics} className="w-full">
              読書分析を有効にする
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="container mx-auto px-4 py-8"
      data-testid="analytics-content"
    >
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">読書分析</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportData}>
            <Download className="mr-2 h-4 w-4" />
            エクスポート
          </Button>
          <AnalyticsSettings />
        </div>
      </div>

      {/* サマリーカード */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card data-testid="stat-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">総読書数</CardTitle>
            <BookOpen className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stats-value">
              {aggregatedStats.totalArticles}
            </div>
            <p className="text-muted-foreground text-xs">記事</p>
          </CardContent>
        </Card>

        <Card data-testid="stat-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">読書時間</CardTitle>
            <Clock className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stats-value">
              {Math.round(aggregatedStats.totalTime / 60)}
            </div>
            <p className="text-muted-foreground text-xs">時間</p>
          </CardContent>
        </Card>

        <Card data-testid="stat-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">完読率</CardTitle>
            <TrendingUp className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stats-value">
              {aggregatedStats.totalArticles > 0
                ? Math.round(
                    (aggregatedStats.completedArticles /
                      aggregatedStats.totalArticles) *
                      100
                  )
                : 0}
              %
            </div>
            <p className="text-muted-foreground text-xs">
              {aggregatedStats.completedArticles} /{' '}
              {aggregatedStats.totalArticles} 記事
            </p>
          </CardContent>
        </Card>

        <Card data-testid="stat-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平均読書時間</CardTitle>
            <Target className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stats-value">
              {aggregatedStats.totalArticles > 0
                ? Math.round(
                    aggregatedStats.totalTime / aggregatedStats.totalArticles
                  )
                : 0}
            </div>
            <p className="text-muted-foreground text-xs">分/記事</p>
          </CardContent>
        </Card>
      </div>

      {/* タブ */}
      <Tabs defaultValue="overview" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="overview">概要</TabsTrigger>
            <TabsTrigger value="tags">タグ分析</TabsTrigger>
            <TabsTrigger value="time">時間分析</TabsTrigger>
            <TabsTrigger value="sources">ソース分析</TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            <Button
              variant={dateRange === 'week' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateRange('week')}
            >
              週間
            </Button>
            <Button
              variant={dateRange === 'month' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateRange('month')}
            >
              月間
            </Button>
          </div>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>日別読書量</CardTitle>
            </CardHeader>
            <CardContent data-testid="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="articles"
                    stroke="#8884d8"
                    name="記事数"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="time"
                    stroke="#82ca9d"
                    name="時間（分）"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tags" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>興味分野TOP10</CardTitle>
            </CardHeader>
            <CardContent data-testid="chart-container">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={tagData} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={100} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="time" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>時間帯別活動</CardTitle>
            </CardHeader>
            <CardContent data-testid="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>ソース別分布</CardTitle>
            </CardHeader>
            <CardContent data-testid="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }: any) =>
                      `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {sourceData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
