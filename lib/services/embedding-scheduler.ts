import { prisma } from '@/lib/prisma';
import { logger, sanitizeError } from '@/lib/logger';
import type { EmbeddingJob, Article } from '@prisma/client';

type EmbeddingJobWithArticle = EmbeddingJob & {
  article: Pick<Article, 'id' | 'title' | 'summary'>;
};

export class EmbeddingScheduler {
  /**
   * Enqueue or re-queue an embedding job for an article.
   * Uses UPSERT semantics to handle concurrent updates.
   *
   * UPSERT Logic:
   * - If job doesn't exist: Create with status=PENDING
   * - If job exists + status=PENDING: Reset attempts, update queuedAt
   * - If job exists + status=PROCESSING: Leave as-is (worker handles)
   * - If job exists + status=COMPLETED/FAILED: Reset to PENDING
   */
  async enqueue(articleId: string): Promise<void> {
    try {
      await prisma.embeddingJob.upsert({
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
    return prisma.embeddingJob.findMany({
      where: {
        status: 'PENDING',
        attempts: { lt: 3 },
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
    return prisma.embeddingJob.findMany({
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
    await prisma.embeddingJob.update({
      where: { id: jobId },
      data: {
        status: 'PENDING',
        attempts: 0,
        error: null,
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
      prisma.embeddingJob.count({ where: { status: 'PENDING' } }),
      prisma.embeddingJob.count({ where: { status: 'PROCESSING' } }),
      prisma.embeddingJob.count({ where: { status: 'COMPLETED' } }),
      prisma.embeddingJob.count({ where: { status: 'FAILED' } }),
      prisma.embeddingJob.count(),
    ]);

    return { pending, processing, completed, failed, total };
  }
}
