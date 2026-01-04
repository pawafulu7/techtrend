/**
 * Batch Executor
 *
 * Utility for executing batch AI analysis jobs with:
 * - Progress tracking
 * - Error handling and partial success
 * - Rate limiting
 * - Logging
 */

import { logger } from '@/lib/logger';

export interface BatchJob<T> {
  id: string;
  input: T;
}

export interface BatchResult<T, R> {
  job: BatchJob<T>;
  success: boolean;
  result?: R;
  error?: string;
  durationMs: number;
}

export interface BatchExecutorOptions {
  concurrency?: number;
  delayBetweenBatchesMs?: number;
  onProgress?: (
    completed: number,
    total: number,
    current: BatchJob<unknown>
  ) => void;
  onJobComplete?: <T, R>(result: BatchResult<T, R>) => void;
}

export interface BatchSummary<T, R> {
  total: number;
  successful: number;
  failed: number;
  results: BatchResult<T, R>[];
  durationMs: number;
}

const DEFAULT_OPTIONS: Required<
  Omit<BatchExecutorOptions, 'onProgress' | 'onJobComplete'>
> = {
  concurrency: 3,
  delayBetweenBatchesMs: 1000,
};

/**
 * Batch Executor for AI analysis jobs
 */
export class BatchExecutor {
  private options: Required<
    Omit<BatchExecutorOptions, 'onProgress' | 'onJobComplete'>
  > &
    Pick<BatchExecutorOptions, 'onProgress' | 'onJobComplete'>;

  constructor(options?: BatchExecutorOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Execute batch jobs with a processor function
   */
  async execute<T, R>(
    jobs: BatchJob<T>[],
    processor: (job: BatchJob<T>) => Promise<R>
  ): Promise<BatchSummary<T, R>> {
    const startTime = Date.now();
    const results: BatchResult<T, R>[] = [];
    let completed = 0;

    logger.info(
      { totalJobs: jobs.length, concurrency: this.options.concurrency },
      'Starting batch execution'
    );

    // Process in batches
    for (let i = 0; i < jobs.length; i += this.options.concurrency) {
      const batch = jobs.slice(i, i + this.options.concurrency);

      const batchResults = await Promise.all(
        batch.map(async (job) => {
          const jobStartTime = Date.now();

          try {
            const result = await processor(job);
            const batchResult: BatchResult<T, R> = {
              job,
              success: true,
              result,
              durationMs: Date.now() - jobStartTime,
            };

            if (this.options.onJobComplete) {
              this.options.onJobComplete(batchResult);
            }

            return batchResult;
          } catch (error) {
            const batchResult: BatchResult<T, R> = {
              job,
              success: false,
              error: error instanceof Error ? error.message : String(error),
              durationMs: Date.now() - jobStartTime,
            };

            logger.warn(
              { jobId: job.id, error: batchResult.error },
              'Batch job failed'
            );

            if (this.options.onJobComplete) {
              this.options.onJobComplete(batchResult);
            }

            return batchResult;
          }
        })
      );

      results.push(...batchResults);
      completed += batch.length;

      // Progress callback
      if (this.options.onProgress && batch.length > 0) {
        this.options.onProgress(
          completed,
          jobs.length,
          batch[batch.length - 1]
        );
      }

      // Add delay between batches to avoid rate limiting
      if (i + this.options.concurrency < jobs.length) {
        await this.delay(this.options.delayBetweenBatchesMs);
      }
    }

    const summary: BatchSummary<T, R> = {
      total: jobs.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
      durationMs: Date.now() - startTime,
    };

    logger.info(
      {
        total: summary.total,
        successful: summary.successful,
        failed: summary.failed,
        durationMs: summary.durationMs,
      },
      'Batch execution completed'
    );

    return summary;
  }

  /**
   * Execute with automatic retry for failed jobs
   */
  async executeWithRetry<T, R>(
    jobs: BatchJob<T>[],
    processor: (job: BatchJob<T>) => Promise<R>,
    maxRetries: number = 1
  ): Promise<BatchSummary<T, R>> {
    const startTime = Date.now();
    let currentJobs = jobs;
    let allResults: BatchResult<T, R>[] = [];
    let retryCount = 0;

    while (currentJobs.length > 0 && retryCount <= maxRetries) {
      const summary = await this.execute(currentJobs, processor);
      allResults = allResults.concat(summary.results.filter((r) => r.success));

      const failedJobs = summary.results
        .filter((r) => !r.success)
        .map((r) => r.job);

      if (failedJobs.length === 0) {
        break;
      }

      if (retryCount < maxRetries) {
        logger.info(
          { failedCount: failedJobs.length, retryCount: retryCount + 1 },
          'Retrying failed jobs'
        );
        currentJobs = failedJobs;
        retryCount++;

        // Wait before retry
        await this.delay(this.options.delayBetweenBatchesMs * 2);
      } else {
        // Add remaining failures to results
        allResults = allResults.concat(
          summary.results.filter((r) => !r.success)
        );
        break;
      }
    }

    return {
      total: jobs.length,
      successful: allResults.filter((r) => r.success).length,
      failed: allResults.filter((r) => !r.success).length,
      results: allResults,
      durationMs: Date.now() - startTime,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
