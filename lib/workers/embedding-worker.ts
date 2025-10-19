import { prisma } from '@/lib/prisma';
import { JobProcessor } from './job-processor';
import { logger } from '@/lib/logger';

export interface WorkerConfig {
  batchSize: number;
  maxAttempts: number;
  timeoutMs: number; // Overall timeout for worker run
  skipEmbedding?: boolean; // For testing
}

export interface WorkerResult {
  status: 'idle' | 'completed' | 'timeout' | 'error';
  processed: number;
  succeeded: number;
  failed: number;
  timedOut: number;
  durationMs: number;
  message?: string;
  error?: string;
}

export class EmbeddingWorker {
  private config: WorkerConfig;
  private processor: JobProcessor;

  constructor(config: Partial<WorkerConfig> = {}) {
    this.config = {
      batchSize: config.batchSize ?? 300, // Reduced from 500 for safety
      maxAttempts: config.maxAttempts ?? 3,
      timeoutMs: config.timeoutMs ?? 9000, // 9s (leave 1s buffer for Vercel 10s limit)
      skipEmbedding: config.skipEmbedding ?? false,
    };

    this.processor = new JobProcessor({
      skipEmbedding: this.config.skipEmbedding,
    });
  }

  /**
   * Run worker to process pending embedding jobs.
   * Returns summary of processing results.
   */
  async run(): Promise<WorkerResult> {
    const startTime = Date.now();

    try {
      // Claim pending jobs (newest first)
      const jobs = await prisma.embeddingJob.findMany({
        where: {
          status: 'PENDING',
          attempts: { lt: this.config.maxAttempts },
        },
        orderBy: { queuedAt: 'desc' }, // Newest articles first
        take: this.config.batchSize,
        include: {
          article: {
            select: {
              id: true,
              title: true,
              summary: true,
            },
          },
        },
      });

      if (jobs.length === 0) {
        return {
          status: 'idle',
          processed: 0,
          succeeded: 0,
          failed: 0,
          timedOut: 0,
          durationMs: Date.now() - startTime,
          message: 'No pending jobs',
        };
      }

      logger.info({ jobCount: jobs.length }, 'Processing embedding jobs');

      // Create AbortController for timeout protection
      const abortController = new AbortController();
      const timeoutHandle = setTimeout(() => {
        abortController.abort();
      }, this.config.timeoutMs);

      // Process jobs in parallel with timeout protection
      const results = await Promise.allSettled(
        jobs.map((job) => {
          // Check if aborted before starting each job
          if (abortController.signal.aborted) {
            return Promise.reject(new Error('Worker timeout'));
          }

          return this.processor.processJob(job);
        })
      );

      clearTimeout(timeoutHandle);

      // Analyze results
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter(
        (r) => r.status === 'rejected' && (r.reason as Error).message !== 'Worker timeout'
      ).length;
      const timedOut = results.filter(
        (r) => r.status === 'rejected' && (r.reason as Error).message === 'Worker timeout'
      ).length;

      const durationMs = Date.now() - startTime;
      const wasTimeout = abortController.signal.aborted;

      logger.info(
        {
          processed: jobs.length,
          succeeded,
          failed,
          timedOut,
          durationMs,
        },
        'Embedding worker completed'
      );

      return {
        status: wasTimeout ? 'timeout' : 'completed',
        processed: jobs.length,
        succeeded,
        failed,
        timedOut,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs,
        },
        'Embedding worker error'
      );

      return {
        status: 'error',
        processed: 0,
        succeeded: 0,
        failed: 0,
        timedOut: 0,
        durationMs,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get worker statistics.
   */
  async getStats() {
    const [pending, processing, completed, failed, total] = await Promise.all([
      prisma.embeddingJob.count({ where: { status: 'PENDING' } }),
      prisma.embeddingJob.count({ where: { status: 'PROCESSING' } }),
      prisma.embeddingJob.count({ where: { status: 'COMPLETED' } }),
      prisma.embeddingJob.count({ where: { status: 'FAILED' } }),
      prisma.embeddingJob.count(),
    ]);

    return { pending, processing, completed, failed, total };
  }
}
