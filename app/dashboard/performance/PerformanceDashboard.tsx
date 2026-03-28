'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertCircle,
  Activity,
  Database,
  TrendingUp,
  Zap,
  RefreshCw,
} from 'lucide-react';
import {
  useMetricsPolling,
  usePollingControl,
} from './hooks/useMetricsPolling';
import type { MetricsHistory } from './types/dashboard';

/**
 * パフォーマンスダッシュボード
 * DBアクセス最適化Phase 3のメトリクスを可視化
 */
export default function PerformanceDashboard() {
  const [history, setHistory] = useState<MetricsHistory>({
    cacheHitRate: [],
    latency: [],
    batchSize: [],
    throughput: [],
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ポーリング制御（バックグラウンドタブでは停止）
  const { isActive, interval } = usePollingControl(30000);

  // React Query によるメトリクス取得
  const { metrics, loading, error, lastUpdated, refresh } = useMetricsPolling(
    interval,
    isActive
  );

  // メトリクス更新時に履歴データを追記（最大50件保持）
  useEffect(() => {
    if (!metrics) return;

    const timestamp = new Date().toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const hitRate = parseFloat(
      metrics.summary.totalCacheHitRate?.replace('%', '') || '0'
    );
    const favLatency =
      metrics.summary.latencyP95?.favorite === 'N/A'
        ? 0
        : metrics.summary.latencyP95?.favorite || 0;
    const viewLat =
      metrics.summary.latencyP95?.view === 'N/A'
        ? 0
        : metrics.summary.latencyP95?.view || 0;
    const avgLatency = (favLatency + viewLat) / 2;

    const favBatch =
      metrics.summary.batchSizes?.favorite === 'N/A'
        ? 0
        : metrics.summary.batchSizes?.favorite || 0;
    const viewBatch =
      metrics.summary.batchSizes?.view === 'N/A'
        ? 0
        : metrics.summary.batchSizes?.view || 0;
    const avgBatchSize = (favBatch + viewBatch) / 2;

    setHistory((prev) => ({
      cacheHitRate: [
        ...prev.cacheHitRate,
        { time: timestamp, value: hitRate },
      ].slice(-50),
      latency: [...prev.latency, { time: timestamp, value: avgLatency }].slice(
        -50
      ),
      batchSize: [
        ...prev.batchSize,
        { time: timestamp, value: avgBatchSize },
      ].slice(-50),
      throughput: prev.throughput,
    }));
  }, [metrics]);

  // 手動リフレッシュ
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  // メトリクス値のフォーマット
  const formatMetricValue = (
    value: number | string | undefined,
    unit?: string
  ): string => {
    if (value === undefined || value === null) return 'N/A';
    if (typeof value === 'string') return value;

    if (unit === 'ms') {
      return `${value.toFixed(1)}ms`;
    } else if (unit === '%') {
      return `${value.toFixed(1)}%`;
    } else if (unit === 'MB') {
      return `${(value / 1024 / 1024).toFixed(1)}MB`;
    }
    return value.toLocaleString();
  };

  // ステータス判定
  const getStatus = (
    metric: string,
    value: number
  ): 'good' | 'warning' | 'critical' => {
    switch (metric) {
      case 'cacheHitRate':
        return value >= 80 ? 'good' : value >= 60 ? 'warning' : 'critical';
      case 'latency':
        return value <= 50 ? 'good' : value <= 100 ? 'warning' : 'critical';
      case 'memory':
        return value <= 70 ? 'good' : value <= 85 ? 'warning' : 'critical';
      default:
        return 'good';
    }
  };

  // ローディング表示
  if (loading && !metrics) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold">パフォーマンスダッシュボード</h1>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // エラー表示
  if (error && !metrics) {
    return (
      <div className="container mx-auto p-6">
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            メトリクスの取得に失敗しました: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const cacheHitRate = parseFloat(
    metrics?.summary?.totalCacheHitRate?.replace('%', '') || '0'
  );

  // N/Aの場合は0として扱う
  const favoriteLatency =
    metrics?.summary?.latencyP95?.favorite === 'N/A'
      ? 0
      : metrics?.summary?.latencyP95?.favorite || 0;
  const viewLatency =
    metrics?.summary?.latencyP95?.view === 'N/A'
      ? 0
      : metrics?.summary?.latencyP95?.view || 0;
  const avgLatency = (favoriteLatency + viewLatency) / 2;

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* ヘッダー */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">パフォーマンスダッシュボード</h1>
          <p className="mt-1 text-gray-600">
            DBアクセス最適化Phase 3 - リアルタイムメトリクス
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            最終更新: {lastUpdated || 'N/A'}
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="rounded-lg bg-blue-500 p-2 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* リアルタイムメトリクス */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* キャッシュヒット率 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4" />
              キャッシュヒット率
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMetricValue(cacheHitRate, '%')}
            </div>
            <div
              className={`mt-1 text-sm ${
                getStatus('cacheHitRate', cacheHitRate) === 'good'
                  ? 'text-green-600'
                  : getStatus('cacheHitRate', cacheHitRate) === 'warning'
                    ? 'text-yellow-600'
                    : 'text-red-600'
              }`}
            >
              {getStatus('cacheHitRate', cacheHitRate) === 'good'
                ? '良好'
                : getStatus('cacheHitRate', cacheHitRate) === 'warning'
                  ? '注意'
                  : '要改善'}
            </div>
          </CardContent>
        </Card>

        {/* レイテンシ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              レイテンシ (P95)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMetricValue(avgLatency, 'ms')}
            </div>
            <div
              className={`mt-1 text-sm ${
                getStatus('latency', avgLatency) === 'good'
                  ? 'text-green-600'
                  : getStatus('latency', avgLatency) === 'warning'
                    ? 'text-yellow-600'
                    : 'text-red-600'
              }`}
            >
              {getStatus('latency', avgLatency) === 'good'
                ? '高速'
                : getStatus('latency', avgLatency) === 'warning'
                  ? '標準'
                  : '遅延あり'}
            </div>
          </CardContent>
        </Card>

        {/* バッチサイズ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" />
              平均バッチサイズ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMetricValue(
                metrics?.summary?.batchSizes
                  ? ((metrics.summary.batchSizes.favorite === 'N/A'
                      ? 0
                      : metrics.summary.batchSizes.favorite) +
                      (metrics.summary.batchSizes.view === 'N/A'
                        ? 0
                        : metrics.summary.batchSizes.view)) /
                      2
                  : 0
              )}
            </div>
            <div className="mt-1 text-sm text-gray-600">最適化中</div>
          </CardContent>
        </Card>

        {/* Redis状態 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Redis メモリ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics?.redis?.memoryUsed || 'N/A'}
            </div>
            <div
              className={`mt-1 text-sm ${
                metrics?.redis?.connected ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {metrics?.redis?.connected ? '接続中' : '切断'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DataLoader詳細 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Favorite DataLoader */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Favorite DataLoader</CardTitle>
            <CardDescription>お気に入り機能のキャッシュ統計</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">L1 ヒット</span>
              <span className="font-mono">
                {metrics?.dataloaders?.favorite?.l1Hits || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">L2 ヒット</span>
              <span className="font-mono">
                {metrics?.dataloaders?.favorite?.l2Hits || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">DBクエリ</span>
              <span className="font-mono">
                {metrics?.dataloaders?.favorite?.dbQueries || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">ヒット率</span>
              <span className="font-mono font-bold text-green-600">
                {metrics?.dataloaders?.favorite?.hitRate || 'N/A'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* View DataLoader */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">View DataLoader</CardTitle>
            <CardDescription>閲覧数機能のキャッシュ統計</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">L1 ヒット</span>
              <span className="font-mono">
                {metrics?.dataloaders?.view?.l1Hits || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">L2 ヒット</span>
              <span className="font-mono">
                {metrics?.dataloaders?.view?.l2Hits || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">DBクエリ</span>
              <span className="font-mono">
                {metrics?.dataloaders?.view?.dbQueries || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">ヒット率</span>
              <span className="font-mono font-bold text-green-600">
                {metrics?.dataloaders?.view?.hitRate || 'N/A'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 推奨事項 */}
      {metrics?.recommendations && metrics.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">最適化推奨</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {metrics.recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-yellow-500">•</span>
                  <span className="text-sm">{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
