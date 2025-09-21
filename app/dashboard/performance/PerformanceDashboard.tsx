'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Activity, Database, TrendingUp, Zap, RefreshCw } from 'lucide-react';
import { usePollingControl } from './hooks/useMetricsPolling';
import type {
  PerformanceMetrics,
  DashboardState
} from './types/dashboard';

/**
 * パフォーマンスダッシュボード
 * DBアクセス最適化Phase 3のメトリクスを可視化
 */
export default function PerformanceDashboard() {
  const [state, setState] = useState<DashboardState>({
    metrics: null,
    history: {
      cacheHitRate: [],
      latency: [],
      batchSize: [],
      throughput: []
    },
    loading: true,
    error: null,
    lastUpdated: null
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  // メトリクスデータ取得
  const fetchMetrics = async () => {
    try {
      setIsRefreshing(true);

      // 並行してAPIを呼び出す
      const [optimizerRes, cacheRes] = await Promise.all([
        fetch('/api/metrics/batch-optimizer'),
        fetch('/api/cache/stats')
      ]);

      if (!optimizerRes.ok || !cacheRes.ok) {
        throw new Error('Failed to fetch metrics');
      }

      const optimizerData = await optimizerRes.json();
      const cacheData = await cacheRes.json();

      // データを統合（batch-optimizerはdata属性、cache/statsは直接プロパティ）
      const metrics: PerformanceMetrics = {
        timestamp: new Date().toISOString(),
        optimizers: optimizerData.data?.optimizers || {},
        dataloaders: optimizerData.data?.dataloaders || {},
        caches: cacheData.caches || {},
        redis: cacheData.redis || {},
        summary: optimizerData.data?.summary || {},
        recommendations: cacheData.recommendations || []
      };

      // 履歴データを更新（最大50件保持）
      setState(prev => {
        const newHistory = { ...prev.history };
        const timestamp = new Date().toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        // キャッシュヒット率
        const hitRate = parseFloat(metrics.summary.totalCacheHitRate?.replace('%', '') || '0');
        newHistory.cacheHitRate = [
          ...prev.history.cacheHitRate,
          { time: timestamp, value: hitRate }
        ].slice(-50);

        // レイテンシ（P95の平均）
        const avgLatency = (
          (metrics.summary.latencyP95?.favorite || 0) +
          (metrics.summary.latencyP95?.view || 0)
        ) / 2;
        newHistory.latency = [
          ...prev.history.latency,
          { time: timestamp, value: avgLatency }
        ].slice(-50);

        // バッチサイズ（平均）
        const avgBatchSize = (
          (metrics.summary.batchSizes?.favorite || 0) +
          (metrics.summary.batchSizes?.view || 0)
        ) / 2;
        newHistory.batchSize = [
          ...prev.history.batchSize,
          { time: timestamp, value: avgBatchSize }
        ].slice(-50);

        return {
          metrics,
          history: newHistory,
          loading: false,
          error: null,
          lastUpdated: new Date().toLocaleString('ja-JP')
        };
      });

    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }
      }));
    } finally {
      setIsRefreshing(false);
    }
  };

  // ポーリング制御（バックグラウンドタブでは停止）
  const { isActive, interval } = usePollingControl(30000);

  // 初回取得と定期更新（可視状態に連動）
  useEffect(() => {
    if (!isActive) return;

    fetchMetrics();
    const intervalId = setInterval(fetchMetrics, interval);

    return () => clearInterval(intervalId);
  }, [isActive, interval]);

  // メトリクス値のフォーマット
  const formatMetricValue = (value: number | string | undefined, unit?: string): string => {
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
  const getStatus = (metric: string, value: number): 'good' | 'warning' | 'critical' => {
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
  if (state.loading && !state.metrics) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">パフォーマンスダッシュボード</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
  if (state.error && !state.metrics) {
    return (
      <div className="container mx-auto p-6">
        <Alert className="bg-red-50 border-red-200">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            メトリクスの取得に失敗しました: {state.error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { metrics } = state;
  const cacheHitRate = parseFloat(metrics?.summary?.totalCacheHitRate?.replace('%', '') || '0');

  // N/Aの場合は0として扱う
  const favoriteLatency = metrics?.summary?.latencyP95?.favorite === 'N/A'
    ? 0
    : (metrics?.summary?.latencyP95?.favorite || 0);
  const viewLatency = metrics?.summary?.latencyP95?.view === 'N/A'
    ? 0
    : (metrics?.summary?.latencyP95?.view || 0);
  const avgLatency = (favoriteLatency + viewLatency) / 2;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">パフォーマンスダッシュボード</h1>
          <p className="text-gray-600 mt-1">
            DBアクセス最適化Phase 3 - リアルタイムメトリクス
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            最終更新: {state.lastUpdated || 'N/A'}
          </span>
          <button
            onClick={fetchMetrics}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* リアルタイムメトリクス */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <div className={`text-sm mt-1 ${
              getStatus('cacheHitRate', cacheHitRate) === 'good' ? 'text-green-600' :
              getStatus('cacheHitRate', cacheHitRate) === 'warning' ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {getStatus('cacheHitRate', cacheHitRate) === 'good' ? '良好' :
               getStatus('cacheHitRate', cacheHitRate) === 'warning' ? '注意' : '要改善'}
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
            <div className={`text-sm mt-1 ${
              getStatus('latency', avgLatency) === 'good' ? 'text-green-600' :
              getStatus('latency', avgLatency) === 'warning' ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {getStatus('latency', avgLatency) === 'good' ? '高速' :
               getStatus('latency', avgLatency) === 'warning' ? '標準' : '遅延あり'}
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
                  ? ((metrics.summary.batchSizes.favorite === 'N/A' ? 0 : metrics.summary.batchSizes.favorite) +
                     (metrics.summary.batchSizes.view === 'N/A' ? 0 : metrics.summary.batchSizes.view)) / 2
                  : 0
              )}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              最適化中
            </div>
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
            <div className={`text-sm mt-1 ${
              metrics?.redis?.connected ? 'text-green-600' : 'text-red-600'
            }`}>
              {metrics?.redis?.connected ? '接続中' : '切断'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DataLoader詳細 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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