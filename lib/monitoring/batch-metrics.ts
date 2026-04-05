/**
 * Batch Processing Metrics Module
 *
 * Tracks metrics for batch jobs including:
 * - RSS feed collection
 * - Summary generation
 * - Scheduled maintenance jobs
 * - Background workers
 */

import logger from '@/lib/logger';

/**
 * Batch job execution status
 */
export type BatchJobStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Batch job execution record
 */
export interface BatchJobExecution {
  jobId: string;
  jobName: string;
  status: BatchJobStatus;
  startTime: number;
  endTime?: number;
  duration?: number;
  itemsProcessed: number;
  itemsFailed: number;
  itemsSkipped: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Batch job statistics
 */
export interface BatchJobStats {
  jobName: string;
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  totalItemsProcessed: number;
  totalItemsFailed: number;
  lastExecution?: BatchJobExecution;
}

/**
 * Batch metrics summary
 */
export interface BatchMetricsSummary {
  timestamp: string;
  uptime: number;
  runningJobs: BatchJobExecution[];
  recentExecutions: BatchJobExecution[];
  jobStats: Record<string, BatchJobStats>;
  summary: {
    totalExecutions: number;
    successCount: number;
    failureCount: number;
    overallSuccessRate: number;
    activeJobs: number;
  };
}

/**
 * Batch Metrics Monitor
 */
export class BatchMetrics {
  private static instance: BatchMetrics;
  private runningJobs: Map<string, BatchJobExecution>;
  private executionHistory: BatchJobExecution[];
  private readonly maxHistorySize: number;
  private startTime: number;

  private constructor() {
    this.runningJobs = new Map();
    this.executionHistory = [];
    this.maxHistorySize = 1000;
    this.startTime = Date.now();
  }

  static getInstance(): BatchMetrics {
    if (!BatchMetrics.instance) {
      BatchMetrics.instance = new BatchMetrics();
    }
    return BatchMetrics.instance;
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Start tracking a batch job
   */
  startJob(jobName: string, metadata?: Record<string, unknown>): string {
    const jobId = this.generateJobId();
    const execution: BatchJobExecution = {
      jobId,
      jobName,
      status: 'running',
      startTime: Date.now(),
      itemsProcessed: 0,
      itemsFailed: 0,
      itemsSkipped: 0,
      metadata,
    };

    this.runningJobs.set(jobId, execution);

    logger.info({
      type: 'batch_job_started',
      jobId,
      jobName,
      metadata,
    });

    return jobId;
  }

  /**
   * Update job progress
   */
  updateProgress(
    jobId: string,
    update: {
      itemsProcessed?: number;
      itemsFailed?: number;
      itemsSkipped?: number;
      metadata?: Record<string, unknown>;
    }
  ): void {
    const job = this.runningJobs.get(jobId);
    if (!job) {
      logger.warn({ jobId }, 'Attempted to update non-existent job');
      return;
    }

    if (update.itemsProcessed !== undefined) {
      job.itemsProcessed = update.itemsProcessed;
    }
    if (update.itemsFailed !== undefined) {
      job.itemsFailed = update.itemsFailed;
    }
    if (update.itemsSkipped !== undefined) {
      job.itemsSkipped = update.itemsSkipped;
    }
    if (update.metadata) {
      job.metadata = { ...job.metadata, ...update.metadata };
    }
  }

  /**
   * Increment processed count
   */
  incrementProcessed(jobId: string, count: number = 1): void {
    const job = this.runningJobs.get(jobId);
    if (job) {
      job.itemsProcessed += count;
    }
  }

  /**
   * Increment failed count
   */
  incrementFailed(jobId: string, count: number = 1): void {
    const job = this.runningJobs.get(jobId);
    if (job) {
      job.itemsFailed += count;
    }
  }

  /**
   * Increment skipped count
   */
  incrementSkipped(jobId: string, count: number = 1): void {
    const job = this.runningJobs.get(jobId);
    if (job) {
      job.itemsSkipped += count;
    }
  }

  /**
   * Complete a job successfully
   */
  completeJob(jobId: string): BatchJobExecution | undefined {
    const job = this.runningJobs.get(jobId);
    if (!job) {
      logger.warn({ jobId }, 'Attempted to complete non-existent job');
      return undefined;
    }

    job.status = 'completed';
    job.endTime = Date.now();
    job.duration = job.endTime - job.startTime;

    this.runningJobs.delete(jobId);
    this.addToHistory(job);

    logger.info({
      type: 'batch_job_completed',
      jobId,
      jobName: job.jobName,
      duration: job.duration,
      itemsProcessed: job.itemsProcessed,
      itemsFailed: job.itemsFailed,
      itemsSkipped: job.itemsSkipped,
    });

    return job;
  }

  /**
   * Mark a job as failed
   */
  failJob(jobId: string, error: string | Error): BatchJobExecution | undefined {
    const job = this.runningJobs.get(jobId);
    if (!job) {
      logger.warn({ jobId }, 'Attempted to fail non-existent job');
      return undefined;
    }

    job.status = 'failed';
    job.endTime = Date.now();
    job.duration = job.endTime - job.startTime;
    job.error = error instanceof Error ? error.message : error;

    this.runningJobs.delete(jobId);
    this.addToHistory(job);

    logger.error({
      type: 'batch_job_failed',
      jobId,
      jobName: job.jobName,
      duration: job.duration,
      errorMessage: job.error,
      itemsProcessed: job.itemsProcessed,
      itemsFailed: job.itemsFailed,
    });

    return job;
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string, reason?: string): BatchJobExecution | undefined {
    const job = this.runningJobs.get(jobId);
    if (!job) {
      return undefined;
    }

    job.status = 'cancelled';
    job.endTime = Date.now();
    job.duration = job.endTime - job.startTime;
    job.error = reason;

    this.runningJobs.delete(jobId);
    this.addToHistory(job);

    logger.info({
      type: 'batch_job_cancelled',
      jobId,
      jobName: job.jobName,
      reason,
    });

    return job;
  }

  /**
   * Add execution to history
   */
  private addToHistory(execution: BatchJobExecution): void {
    this.executionHistory.push(execution);
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }
  }

  /**
   * Get statistics for a specific job
   */
  getJobStats(jobName: string): BatchJobStats | undefined {
    const executions = this.executionHistory.filter(
      (e) => e.jobName === jobName
    );
    if (executions.length === 0) {
      return undefined;
    }

    const completed = executions.filter((e) => e.status === 'completed');
    const failed = executions.filter((e) => e.status === 'failed');

    const durations = completed
      .filter((e) => e.duration !== undefined)
      .map((e) => e.duration!);

    return {
      jobName,
      totalExecutions: executions.length,
      successCount: completed.length,
      failureCount: failed.length,
      successRate:
        executions.length > 0
          ? Math.round((completed.length / executions.length) * 10000) / 100
          : 0,
      avgDuration:
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0,
      minDuration: durations.length > 0 ? Math.min(...durations) : 0,
      maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
      totalItemsProcessed: executions.reduce(
        (sum, e) => sum + e.itemsProcessed,
        0
      ),
      totalItemsFailed: executions.reduce((sum, e) => sum + e.itemsFailed, 0),
      lastExecution: executions[executions.length - 1],
    };
  }

  /**
   * Get all job statistics
   */
  getAllJobStats(): Record<string, BatchJobStats> {
    const jobNames = new Set(this.executionHistory.map((e) => e.jobName));
    const stats: Record<string, BatchJobStats> = {};

    for (const jobName of jobNames) {
      const jobStats = this.getJobStats(jobName);
      if (jobStats) {
        stats[jobName] = jobStats;
      }
    }

    return stats;
  }

  /**
   * Get batch metrics summary
   */
  getSummary(): BatchMetricsSummary {
    const allStats = this.getAllJobStats();
    const totalExecutions = this.executionHistory.length;
    const successCount = this.executionHistory.filter(
      (e) => e.status === 'completed'
    ).length;
    const failureCount = this.executionHistory.filter(
      (e) => e.status === 'failed'
    ).length;

    return {
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      runningJobs: Array.from(this.runningJobs.values()),
      recentExecutions: this.executionHistory.slice(-20),
      jobStats: allStats,
      summary: {
        totalExecutions,
        successCount,
        failureCount,
        overallSuccessRate:
          totalExecutions > 0
            ? Math.round((successCount / totalExecutions) * 10000) / 100
            : 0,
        activeJobs: this.runningJobs.size,
      },
    };
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.runningJobs.clear();
    this.executionHistory = [];
    this.startTime = Date.now();
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    if (BatchMetrics.instance) {
      BatchMetrics.instance.reset();
    }
    BatchMetrics.instance = undefined!;
  }
}

// Singleton export
export const batchMetrics = BatchMetrics.getInstance();

/**
 * Utility wrapper for batch job execution with automatic metrics
 */
export async function withBatchMetrics<T>(
  jobName: string,
  job: (context: BatchJobContext) => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const metrics = BatchMetrics.getInstance();
  const jobId = metrics.startJob(jobName, metadata);

  const context: BatchJobContext = {
    jobId,
    incrementProcessed: (count = 1) => metrics.incrementProcessed(jobId, count),
    incrementFailed: (count = 1) => metrics.incrementFailed(jobId, count),
    incrementSkipped: (count = 1) => metrics.incrementSkipped(jobId, count),
    updateMetadata: (meta) => metrics.updateProgress(jobId, { metadata: meta }),
  };

  try {
    const result = await job(context);
    metrics.completeJob(jobId);
    return result;
  } catch (error) {
    metrics.failJob(jobId, error instanceof Error ? error : String(error));
    throw error;
  }
}

/**
 * Context provided to batch job functions
 */
export interface BatchJobContext {
  jobId: string;
  incrementProcessed: (count?: number) => void;
  incrementFailed: (count?: number) => void;
  incrementSkipped: (count?: number) => void;
  updateMetadata: (metadata: Record<string, unknown>) => void;
}
