import { prisma } from '@/lib/prisma';
import { ArticleEmbeddingPipeline } from '@/lib/rag/article-embedding-pipeline';
import { logger, sanitizeError } from '@/lib/logger';
import type { EmbeddingJob, Article } from '@prisma/client';

type EmbeddingJobWithArticle = EmbeddingJob & {
  article: Pick<Article, 'id' | 'title' | 'summary'> | null;
};

export interface JobProcessorOptions {
  skipEmbedding?: boolean; // For testing without API calls
}

export class JobProcessor {
  private pipeline: ArticleEmbeddingPipeline;
  private options: JobProcessorOptions;

  constructor(options: JobProcessorOptions = {}) {
    this.pipeline = new ArticleEmbeddingPipeline(prisma);
    this.options = options;
  }

  /**
   * Process a single embedding job.
   * Handles article cascade delete gracefully.
   */
  async processJob(job: EmbeddingJobWithArticle): Promise<void> {
    try {
      // Mark as processing (optimistic locking via status check)
      const updated = await prisma.embeddingJob.updateMany({
        where: {
          id: job.id,
          status: 'PENDING', // Only claim if still PENDING
        },
        data: {
          status: 'PROCESSING',
          attempts: { increment: 1 },
        },
      });

      // Job already claimed by another worker or re-queued
      if (updated.count === 0) {
        logger.debug({ jobId: job.id }, 'Job already claimed or re-queued, skipping');
        return;
      }

      // Check if article still exists (cascade delete handling)
      if (!job.article || !job.article.summary) {
        logger.warn({ jobId: job.id }, 'Article deleted or has no summary, marking as skipped');

        // Try to mark as SKIPPED (may fail if cascade deleted)
        try {
          await prisma.embeddingJob.updateMany({
            where: { id: job.id },
            data: {
              status: 'FAILED',
              error: 'Article deleted or missing summary',
            },
          });
        } catch (error) {
          // Job likely deleted by cascade - this is OK
          logger.debug(
            { jobId: job.id, error: sanitizeError(error) },
            'Failed to update job status (likely cascade deleted)'
          );
        }
        return;
      }

      // Skip embedding generation if flag set (for testing)
      if (this.options.skipEmbedding) {
        logger.debug({ jobId: job.id }, 'Skipping embedding generation (test mode)');

        await prisma.embeddingJob.updateMany({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            processedAt: new Date(),
          },
        });
        return;
      }

      // Generate embedding
      const result = await this.pipeline.embedArticle(job.article as Article);

      // Check if job still exists (may have been cascade deleted during processing)
      const currentJob = await prisma.embeddingJob.findUnique({
        where: { id: job.id },
      });

      if (!currentJob) {
        logger.info({ jobId: job.id }, 'Job deleted during processing (article cascade)');
        return;
      }

      if (result.success) {
        // Mark as completed (only if still PROCESSING)
        await prisma.embeddingJob.updateMany({
          where: {
            id: job.id,
            status: 'PROCESSING', // Only update if still processing
          },
          data: {
            status: 'COMPLETED',
            processedAt: new Date(),
            error: null,
          },
        });

        logger.info(
          {
            jobId: job.id,
            articleId: job.articleId,
            embeddingsCreated: result.embeddingsCreated,
          },
          'Embedding job completed'
        );
      } else {
        // Mark as failed (or retry if attempts < maxAttempts)
        const shouldRetry = job.attempts + 1 < job.maxAttempts;

        await prisma.embeddingJob.updateMany({
          where: { id: job.id },
          data: {
            status: shouldRetry ? 'PENDING' : 'FAILED',
            error: result.error || 'Unknown error',
          },
        });

        logger.warn(
          {
            jobId: job.id,
            articleId: job.articleId,
            error: result.error,
            willRetry: shouldRetry,
          },
          'Embedding job failed'
        );
      }
    } catch (error) {
      // Handle unexpected errors
      const shouldRetry = job.attempts < job.maxAttempts;

      try {
        await prisma.embeddingJob.updateMany({
          where: { id: job.id },
          data: {
            status: shouldRetry ? 'PENDING' : 'FAILED',
            error: (error as Error).message,
          },
        });
      } catch (updateError) {
        // Job might have been deleted by cascade
        logger.debug(
          {
            jobId: job.id,
            error: sanitizeError(updateError),
          },
          'Failed to update job (likely cascade deleted)'
        );
      }

      // Re-throw for Promise.allSettled
      throw error;
    }
  }
}
