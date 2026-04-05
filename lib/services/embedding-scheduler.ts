import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { EmbeddingJob, Article, PrismaClient } from '@prisma/client';

type EmbeddingJobWithArticle = EmbeddingJob & {
  article: Pick<Article, 'id' | 'title' | 'summary'>;
};

const MAX_ATTEMPTS = 3;

export class EmbeddingScheduler {
  constructor(private readonly db: PrismaClient = prisma) {}
  /**
   * Enqueue or re-queue an embedding job for an article.
   * Uses UPSERT semantics to handle concurrent updates.
   *
   * UPSERT Logic:
   * - If job doesn't exist: Create with status=PENDING
   * - If job exists (any status): Reset to PENDING, clear attempts/errors/processedAt
   *
   * Note: This simple UPSERT always resets status to PENDING, even for PROCESSING jobs.
   * The worker handles this gracefully via optimistic locking.
   */
  async enqueue(articleId: string): Promise<void> {
    try {
      await this.db.embeddingJob.upsert({
        where: { articleId },
        create: {
          articleId,
          status: 'PENDING',
          attempts: 0,
          queuedAt: new Date(),
        },
        update: {
          status: 'PENDING',
          attempts: 0,
          queuedAt: new Date(),
          error: null,
          processedAt: null,
        },
      });

      logger.debug({ articleId }, 'Embedding job enqueued/re-queued');
    } catch (error) {
      logger.error(
        {
          articleId,
          err: error,
          errorCode: (error as any)?.code,
        },
        'CRITICAL: Failed to enqueue embedding job'
      );

      // Don't throw - fire-and-forget pattern
      // Summary generation should succeed even if job enqueue fails
    }
  }

  /**
   * Get pending jobs for worker processing.
   * Newest articles first (better user experience).
   */
  async getPendingJobs(limit: number = 500): Promise<EmbeddingJobWithArticle[]> {
    return this.db.embeddingJob.findMany({
      where: {
        status: 'PENDING',
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: { queuedAt: 'desc' },
      take: limit,
      include: {
        article: {
          select: {
            id: true,
            title: true,
            summary: true,
          },
        },
      },
    }) as Promise<EmbeddingJobWithArticle[]>;
  }

  /**
   * Get failed jobs for debugging.
   */
  async getFailedJobs(limit: number = 100): Promise<EmbeddingJobWithArticle[]> {
    return this.db.embeddingJob.findMany({
      where: { status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        article: {
          select: {
            id: true,
            title: true,
            summary: true,
          },
        },
      },
    }) as Promise<EmbeddingJobWithArticle[]>;
  }

  /**
   * Retry a failed job.
   */
  async retryFailed(jobId: string): Promise<void> {
    await this.db.embeddingJob.update({
      where: { id: jobId },
      data: {
        status: 'PENDING',
        attempts: 0,
        error: null,
        processedAt: null,
        queuedAt: new Date(),
      },
    });

    logger.info({ jobId }, 'Failed job re-queued for retry');
  }

  /**
   * Get job statistics.
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  }> {
    const [pending, processing, completed, failed, total] = await Promise.all([
      this.db.embeddingJob.count({ where: { status: 'PENDING' } }),
      this.db.embeddingJob.count({ where: { status: 'PROCESSING' } }),
      this.db.embeddingJob.count({ where: { status: 'COMPLETED' } }),
      this.db.embeddingJob.count({ where: { status: 'FAILED' } }),
      this.db.embeddingJob.count(),
    ]);

    return { pending, processing, completed, failed, total };
  }


  /**
   * Recover stuck jobs (PROCESSING for too long).
   * Resets stuck jobs to PENDING status so they can be retried.
   * 
   * Safety measures:
   * - Only resets jobs that haven't exceeded maxAttempts
   * - Does NOT reset attempts counter (prevents infinite retry loops)
   * - Batch limit prevents DB overload
   * 
   * @param ageMinutes Jobs older than this are considered stuck (default: 30)
   * @param limit Maximum jobs to reset per run (default: 100)
   * @returns Recovery statistics
   */
  async recoverStuckJobs(
    ageMinutes: number = 30,
    limit: number = 100
  ): Promise<{
    found: number;
    reset: number;
    skipped: number;
    oldestAgeMinutes?: number;
  }> {
    const cutoffTime = new Date(Date.now() - ageMinutes * 60 * 1000);

    // Find stuck jobs (PROCESSING status older than threshold)
    const stuckJobs = await this.db.embeddingJob.findMany({
      where: {
        status: 'PROCESSING',
        queuedAt: { lt: cutoffTime },
      },
      orderBy: { queuedAt: 'asc' },
      take: limit,
      select: {
        id: true,
        attempts: true,
        maxAttempts: true,
        queuedAt: true,
      },
    });

    if (stuckJobs.length === 0) {
      return { found: 0, reset: 0, skipped: 0 };
    }

    // Calculate oldest job age
    const oldestJob = stuckJobs[0];
    const oldestAgeMinutes = Math.round(
      (Date.now() - oldestJob.queuedAt.getTime()) / 60000
    );

    // Filter jobs that haven't exceeded max attempts
    const jobsToReset = stuckJobs.filter((job) => job.attempts < job.maxAttempts);
    const skipped = stuckJobs.length - jobsToReset.length;

    if (jobsToReset.length === 0) {
      logger.info(
        { found: stuckJobs.length, skipped, oldestAgeMinutes },
        'All stuck jobs exceeded max attempts, skipping reset'
      );
      return { found: stuckJobs.length, reset: 0, skipped, oldestAgeMinutes };
    }

    // Reset jobs to PENDING (do NOT reset attempts to prevent infinite loops)
    const result = await this.db.embeddingJob.updateMany({
      where: {
        id: { in: jobsToReset.map((j) => j.id) },
        status: 'PROCESSING', // Safety check: still PROCESSING
      },
      data: {
        status: 'PENDING',
        error: null,
        // Note: Do NOT reset attempts to prevent infinite retry loops
      },
    });

    logger.info(
      {
        found: stuckJobs.length,
        reset: result.count,
        skipped,
        oldestAgeMinutes,
        ageThreshold: ageMinutes,
      },
      'Stuck embedding jobs recovered'
    );

    return {
      found: stuckJobs.length,
      reset: result.count,
      skipped,
      oldestAgeMinutes,
    };
  }
}
