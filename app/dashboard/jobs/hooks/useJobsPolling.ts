'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
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
  const [processingLogs, setProcessingLogs] =
    useState<ProcessingLogsResponse | null>(null);
  const [embeddingSummary, setEmbeddingSummary] =
    useState<EmbeddingSummaryResponse | null>(null);
  const [articleStats, setArticleStats] =
    useState<ArticleStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<JobDashboardError | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchAllData = useCallback(async () => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      // Fetch all APIs in parallel
      const [logsRes, embeddingRes, statsRes] = await Promise.all([
        fetch('/api/admin/jobs/processing-logs', {
          signal: abortControllerRef.current.signal,
        }),
        fetch('/api/admin/jobs/embedding-summary', {
          signal: abortControllerRef.current.signal,
        }),
        fetch(`/api/admin/jobs/article-stats?range=${articleStatsRange}`, {
          signal: abortControllerRef.current.signal,
        }),
      ]);

      // Check for auth errors
      if (logsRes.status === 401 || embeddingRes.status === 401 || statsRes.status === 401) {
        throw new Error('Unauthorized. Admin access required.');
      }

      if (!logsRes.ok || !embeddingRes.ok || !statsRes.ok) {
        throw new Error('Failed to fetch job data');
      }

      const [logsData, embeddingData, statsData] = await Promise.all([
        logsRes.json(),
        embeddingRes.json(),
        statsRes.json(),
      ]);

      setProcessingLogs(logsData);
      setEmbeddingSummary(embeddingData);
      setArticleStats(statsData);
      setLastUpdated(new Date().toLocaleString('ja-JP'));
      setLoading(false);
    } catch (err: unknown) {
      // Ignore AbortError
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      const dashboardError: JobDashboardError = {
        message: err instanceof Error ? err.message : 'Unknown error occurred',
        timestamp: new Date().toISOString(),
      };

      setError(dashboardError);
      setLoading(false);
    }
  }, [articleStatsRange]);

  const refresh = useCallback(async () => {
    await fetchAllData();
  }, [fetchAllData]);

  // Start/stop polling
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial fetch
    fetchAllData();

    // Start polling
    intervalRef.current = setInterval(() => {
      fetchAllData();
    }, interval);

    // Cleanup
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
  }, [enabled, interval, fetchAllData]);

  return {
    processingLogs,
    embeddingSummary,
    articleStats,
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
