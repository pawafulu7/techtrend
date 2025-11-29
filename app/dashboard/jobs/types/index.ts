/**
 * Job Management Dashboard Types
 */

// Processing Logs Types
export interface ProcessingLogEntry {
  id: string;
  processName: string;
  status: 'success' | 'failed' | 'partial';
  processedCount: number;
  lastProcessedAt: string;
  metadata: Record<string, unknown> | null;
}

export interface ProcessingLogsResponse {
  logs: ProcessingLogEntry[];
  summary: {
    total: number;
    successCount: number;
    failedCount: number;
    partialCount: number;
    successRate: number;
  };
  lastUpdated: string;
}

// Embedding Summary Types
export interface StuckJob {
  id: string;
  articleId: string;
  queuedAt: string;
  processingSince: string;
  durationMinutes: number;
  attempts: number;
}

export interface HighRetryJob {
  id: string;
  articleId: string;
  attempts: number;
  maxAttempts: number;
  retriesRemaining: number;
  error: string | null;
}

export interface EmbeddingSummaryResponse {
  statusCounts: {
    PENDING: number;
    PROCESSING: number;
    COMPLETED: number;
    FAILED: number;
    total: number;
  };
  completionRate: number;
  stuckJobs: StuckJob[];
  highRetryJobs: HighRetryJob[];
  lastUpdated: string;
}

// Article Stats Types
export interface SourceStats {
  source: string;
  count: number;
  percentage: number;
}

export interface DailyStats {
  date: string;
  total: number;
  withSummary: number;
  summaryRate: number;
}

export interface ArticleStatsResponse {
  bySource: SourceStats[];
  byDate: DailyStats[];
  totals: {
    articles: number;
    summaries: number;
    overallRate: number;
  };
  period: {
    start: string;
    end: string;
    days: number;
  };
  lastUpdated: string;
}

// Dashboard State Types
export interface JobDashboardError {
  message: string;
  code?: string;
  timestamp: string;
}

export interface JobDashboardState {
  processingLogs: ProcessingLogsResponse | null;
  embeddingSummary: EmbeddingSummaryResponse | null;
  articleStats: ArticleStatsResponse | null;
  loading: boolean;
  error: JobDashboardError | null;
  lastUpdated: string | null;
}
