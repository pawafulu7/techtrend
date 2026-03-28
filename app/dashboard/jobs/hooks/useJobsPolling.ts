'use client';

import { useQueries } from '@tanstack/react-query';
import { useMemo, useState, useEffect } from 'react';
import type {
  ProcessingLogsResponse,
  EmbeddingSummaryResponse,
  ArticleStatsResponse,
  JobDashboardError,
} from '../types';

interface JobsPollingResult {
  processingLogs: ProcessingLogsResponse | null;
  embeddingSummary: EmbeddingSummaryResponse | null;
  articleStats: ArticleStatsResponse | null;
  loading: boolean;
  error: JobDashboardError | null;
  lastUpdated: string | null;
  refresh: () => Promise<void>;
}

/**
 * Job Management Dashboard polling hook
 * Fetches all job-related data with periodic updates
 */
export function useJobsPolling(
  interval: number = 30000, // Default 30 seconds
  enabled: boolean = true,
  articleStatsRange: string = '7d'
): JobsPollingResult {
  const results = useQueries({
    queries: [
      {
        queryKey: ['jobs-processing-logs'],
        queryFn: async () => {
          const res = await fetch('/api/admin/jobs/processing-logs');
          // Check for auth errors
          if (res.status === 401)
            throw new Error('Unauthorized. Authentication required.');
          if (res.status === 403)
            throw new Error('Forbidden. Admin access required.');
          if (!res.ok) throw new Error('processing-logs API failed');
          return res.json() as Promise<ProcessingLogsResponse>;
        },
        refetchInterval: enabled ? interval : false,
        enabled,
      },
      {
        queryKey: ['jobs-embedding-summary'],
        queryFn: async () => {
          const res = await fetch('/api/admin/jobs/embedding-summary');
          if (res.status === 401)
            throw new Error('Unauthorized. Authentication required.');
          if (res.status === 403)
            throw new Error('Forbidden. Admin access required.');
          if (!res.ok) throw new Error('embedding-summary API failed');
          return res.json() as Promise<EmbeddingSummaryResponse>;
        },
        refetchInterval: enabled ? interval : false,
        enabled,
      },
      {
        queryKey: ['jobs-article-stats', articleStatsRange],
        queryFn: async () => {
          const res = await fetch(
            `/api/admin/jobs/article-stats?range=${articleStatsRange}`
          );
          if (res.status === 401)
            throw new Error('Unauthorized. Authentication required.');
          if (res.status === 403)
            throw new Error('Forbidden. Admin access required.');
          if (!res.ok) throw new Error('article-stats API failed');
          return res.json() as Promise<ArticleStatsResponse>;
        },
        refetchInterval: enabled ? interval : false,
        enabled,
      },
    ],
  });

  const [logsQuery, embeddingQuery, statsQuery] = results;

  const loading =
    logsQuery.isLoading || embeddingQuery.isLoading || statsQuery.isLoading;

  // lastUpdated を派生（いずれかのデータが存在すれば現在時刻を返す）
  const lastUpdated = useMemo(() => {
    if (
      !logsQuery.isLoading &&
      !embeddingQuery.isLoading &&
      !statsQuery.isLoading &&
      (logsQuery.dataUpdatedAt ||
        embeddingQuery.dataUpdatedAt ||
        statsQuery.dataUpdatedAt)
    ) {
      const latestUpdate = Math.max(
        logsQuery.dataUpdatedAt ?? 0,
        embeddingQuery.dataUpdatedAt ?? 0,
        statsQuery.dataUpdatedAt ?? 0
      );
      return latestUpdate > 0
        ? new Date(latestUpdate).toLocaleString('ja-JP')
        : null;
    }
    return null;
  }, [
    logsQuery.isLoading,
    logsQuery.dataUpdatedAt,
    embeddingQuery.isLoading,
    embeddingQuery.dataUpdatedAt,
    statsQuery.isLoading,
    statsQuery.dataUpdatedAt,
  ]);

  // 部分失敗ハンドリング: 各クエリが独立しているため、失敗した箇所のみエラー報告
  const error = useMemo<JobDashboardError | null>(() => {
    const failedApis: string[] = [];

    if (logsQuery.error) failedApis.push('processing-logs');
    if (embeddingQuery.error) failedApis.push('embedding-summary');
    if (statsQuery.error) failedApis.push('article-stats');

    if (failedApis.length === 3) {
      // 全失敗: 最初のエラーメッセージを使用
      const firstError =
        logsQuery.error || embeddingQuery.error || statsQuery.error;
      return {
        message:
          firstError instanceof Error
            ? firstError.message
            : 'Failed to fetch all job data',
        timestamp: new Date().toISOString(),
        kind: 'full',
        failedApis,
      };
    } else if (failedApis.length > 0) {
      // 部分失敗
      return {
        message: `Partial failure: ${failedApis.join(', ')} API(s) failed`,
        timestamp: new Date().toISOString(),
        kind: 'partial',
        failedApis,
      };
    }
    return null;
  }, [logsQuery.error, embeddingQuery.error, statsQuery.error]);

  const refresh = async () => {
    await Promise.all([
      logsQuery.refetch(),
      embeddingQuery.refetch(),
      statsQuery.refetch(),
    ]);
  };

  return {
    processingLogs: logsQuery.data ?? null,
    embeddingSummary: embeddingQuery.data ?? null,
    articleStats: statsQuery.data ?? null,
    loading,
    error,
    lastUpdated,
    refresh,
  };
}

/**
 * Polling control hook for background tab handling
 * Reused pattern from Performance Dashboard
 */
export function usePollingControl(defaultInterval: number = 30000) {
  const [isActive, setIsActive] = useState(true);
  const [interval, setIntervalState] = useState(defaultInterval);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Pause polling when tab is in background
        setIsActive(false);
      } else {
        // Resume polling when tab is in foreground
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
    setInterval: setIntervalState,
    pause: () => setIsActive(false),
    resume: () => setIsActive(true),
  };
}
