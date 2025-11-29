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

      // Fetch all APIs in parallel using allSettled for partial failure handling
      const results = await Promise.allSettled([
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

      const [logsResult, embeddingResult, statsResult] = results;

      // Check for auth errors (401 or 403 indicates auth issues)
      const responses = results
        .filter((r): r is PromiseFulfilledResult<Response> => r.status === 'fulfilled')
        .map((r) => r.value);

      const authError = responses.find((r) => r.status === 401 || r.status === 403);
      if (authError) {
        throw new Error(
          authError.status === 401
            ? 'Unauthorized. Authentication required.'
            : 'Forbidden. Admin access required.'
        );
      }

      // Process each result independently
      const errors: string[] = [];

      if (logsResult.status === 'fulfilled' && logsResult.value.ok) {
        const logsData = await logsResult.value.json();
        setProcessingLogs(logsData);
      } else {
        errors.push('processing-logs');
        // Keep previous data on partial failure
      }

      if (embeddingResult.status === 'fulfilled' && embeddingResult.value.ok) {
        const embeddingData = await embeddingResult.value.json();
        setEmbeddingSummary(embeddingData);
      } else {
        errors.push('embedding-summary');
      }

      if (statsResult.status === 'fulfilled' && statsResult.value.ok) {
        const statsData = await statsResult.value.json();
        setArticleStats(statsData);
      } else {
        errors.push('article-stats');
      }

      // Set partial error if some APIs failed
      if (errors.length > 0 && errors.length < 3) {
        setError({
          message: `Partial failure: ${errors.join(', ')} API(s) failed`,
          timestamp: new Date().toISOString(),
        });
      } else if (errors.length === 3) {
        throw new Error('Failed to fetch all job data');
      } else {
        setError(null);
      }

      // Use Japanese locale for admin dashboard (internal tool)
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
