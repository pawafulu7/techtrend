import { useEffect, useRef, useCallback, useState } from 'react';
import type { PerformanceMetrics, DashboardError } from '../types/dashboard';

/**
 * メトリクスポーリングフック
 * 定期的にメトリクスデータを取得する
 */
export function useMetricsPolling(
  interval: number = 30000, // デフォルト30秒
  enabled: boolean = true
) {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DashboardError | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // メトリクス取得関数
  const fetchMetrics = useCallback(async () => {
    // 前回のリクエストをキャンセル
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 新しいAbortControllerを作成
    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      // 並行してAPIを呼び出す
      const [optimizerRes, cacheRes] = await Promise.all([
        fetch('/api/metrics/batch-optimizer', {
          signal: abortControllerRef.current.signal
        }),
        fetch('/api/cache/stats', {
          signal: abortControllerRef.current.signal
        })
      ]);

      if (!optimizerRes.ok || !cacheRes.ok) {
        throw new Error('Failed to fetch metrics');
      }

      const optimizerData = await optimizerRes.json();
      const cacheData = await cacheRes.json();

      // データを統合
      const metrics: PerformanceMetrics = {
        timestamp: new Date().toISOString(),
        optimizers: optimizerData.optimizers || {},
        dataloaders: optimizerData.dataloaders || {},
        caches: cacheData.caches || {},
        redis: cacheData.redis || {},
        summary: optimizerData.summary || {},
        recommendations: cacheData.recommendations || []
      };

      setMetrics(metrics);
      setLastUpdated(new Date().toLocaleString('ja-JP'));
      setLoading(false);

      return metrics;
    } catch (err: any) {
      // AbortErrorは無視
      if (err.name === 'AbortError') {
        return null;
      }

      const error: DashboardError = {
        message: err.message || 'Unknown error occurred',
        code: err.code,
        timestamp: new Date().toISOString()
      };

      setError(error);
      setLoading(false);
      return null;
    }
  }, []);

  // 手動リフレッシュ関数
  const refresh = useCallback(async () => {
    return fetchMetrics();
  }, [fetchMetrics]);

  // ポーリング開始/停止
  useEffect(() => {
    if (!enabled) {
      // ポーリング停止
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // 初回取得
    fetchMetrics();

    // ポーリング開始
    intervalRef.current = setInterval(() => {
      fetchMetrics();
    }, interval);

    // クリーンアップ
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [enabled, interval, fetchMetrics]);

  return {
    metrics,
    loading,
    error,
    lastUpdated,
    refresh
  };
}

/**
 * メトリクスデータフック
 * 単一のAPI呼び出しでメトリクスを取得
 */
export function useMetricsData(endpoint: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(endpoint, {
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch data from ${endpoint}`);
        }

        const data = await response.json();
        setData(data);
        setLoading(false);
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return;
        }
        setError(err);
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      abortController.abort();
    };
  }, [endpoint]);

  return { data, loading, error };
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
    resume: () => setIsActive(true)
  };
}