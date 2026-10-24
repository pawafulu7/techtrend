import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo, useState, useEffect } from 'react';
import type { PerformanceMetrics, DashboardError } from '../types/dashboard';
import { createEmptyPerformanceMetrics } from '../types/dashboard';

/**
 * メトリクスポーリングフック
 * 定期的にメトリクスデータを取得する
 */
export function useMetricsPolling(
  interval: number = 30000, // デフォルト30秒
  enabled: boolean = true
) {
  const results = useQueries({
    queries: [
      {
        queryKey: ['metrics-batch-optimizer'],
        queryFn: async () => {
          const res = await fetch('/api/metrics/batch-optimizer');
          if (!res.ok)
            throw new Error('Failed to fetch batch-optimizer metrics');
          return res.json();
        },
        refetchInterval: enabled ? interval : false,
        enabled,
      },
      {
        queryKey: ['metrics-cache-stats'],
        queryFn: async () => {
          const res = await fetch('/api/cache/stats');
          if (!res.ok) throw new Error('Failed to fetch cache stats');
          return res.json();
        },
        refetchInterval: enabled ? interval : false,
        enabled,
      },
    ],
  });

  const [optimizerQuery, cacheQuery] = results;

  const loading = optimizerQuery.isLoading || cacheQuery.isLoading;

  // 両クエリが成功したときにlastUpdatedを派生
  const lastUpdated = useMemo(() => {
    if (
      !optimizerQuery.isLoading &&
      !cacheQuery.isLoading &&
      (optimizerQuery.dataUpdatedAt || cacheQuery.dataUpdatedAt)
    ) {
      const latestUpdate = Math.max(
        optimizerQuery.dataUpdatedAt ?? 0,
        cacheQuery.dataUpdatedAt ?? 0
      );
      return latestUpdate > 0
        ? new Date(latestUpdate).toLocaleString('ja-JP')
        : null;
    }
    return null;
  }, [
    optimizerQuery.isLoading,
    optimizerQuery.dataUpdatedAt,
    cacheQuery.isLoading,
    cacheQuery.dataUpdatedAt,
  ]);

  // エラー状態を統合
  const error: DashboardError | null =
    optimizerQuery.error || cacheQuery.error
      ? {
          message:
            (optimizerQuery.error instanceof Error
              ? optimizerQuery.error.message
              : undefined) ||
            (cacheQuery.error instanceof Error
              ? cacheQuery.error.message
              : undefined) ||
            'Unknown error occurred',
          timestamp: new Date().toISOString(),
        }
      : null;

  // データを統合（batch-optimizerはdata属性、cache/statsは直接プロパティ）
  let metrics: PerformanceMetrics | null = null;
  if (optimizerQuery.data || cacheQuery.data) {
    const optimizerRaw = optimizerQuery.data ?? {};
    const optimizerData = optimizerRaw.data ?? {};
    const cacheData = cacheQuery.data ?? {};
    const defaults = createEmptyPerformanceMetrics();

    metrics = {
      timestamp: new Date().toISOString(),
      optimizers: optimizerData.optimizers ?? defaults.optimizers,
      dataloaders: optimizerData.dataloaders ?? defaults.dataloaders,
      caches: cacheData.caches ?? defaults.caches,
      redis: cacheData.redis ?? defaults.redis,
      summary: optimizerData.summary ?? defaults.summary,
      recommendations: cacheData.recommendations ?? defaults.recommendations,
    };
  }

  // 手動リフレッシュ関数
  const refresh = async () => {
    await Promise.all([optimizerQuery.refetch(), cacheQuery.refetch()]);
  };

  return {
    metrics,
    loading,
    error,
    lastUpdated,
    refresh,
  };
}

/**
 * メトリクスデータフック
 * 単一のAPI呼び出しでメトリクスを取得
 */
export function useMetricsData(endpoint: string) {
  const {
    data,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ['metrics-data', endpoint],
    queryFn: async () => {
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`Failed to fetch data from ${endpoint}`);
      }
      return response.json();
    },
  });

  return {
    data: data ?? null,
    loading,
    error: error as Error | null,
  };
}

/**
 * ポーリング状態管理フック
 * バックグラウンドタブでのポーリング制御
 */
export function usePollingControl(defaultInterval: number = 30000) {
  const [isActive, setIsActive] = useState(true);
  const [interval, setInterval] = useState(defaultInterval);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // バックグラウンドタブではポーリング停止
        setIsActive(false);
      } else {
        // フォアグラウンドに戻ったらポーリング再開
        setIsActive(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return {
    isActive,
    interval,
    setInterval,
    pause: () => setIsActive(false),
    resume: () => setIsActive(true),
  };
}
