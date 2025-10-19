import { prisma } from '@/lib/prisma';
import { logger, sanitizeError } from '@/lib/logger';
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
          error: sanitizeError(error),
        },
        'Failed to enqueue embedding job'
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
}
