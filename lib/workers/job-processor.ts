import { prisma } from '@/lib/prisma';
import { ArticleEmbeddingPipeline } from '@/lib/rag/article-embedding-pipeline';
import { logger, sanitizeError } from '@/lib/logger';
import type { EmbeddingJob, Article } from '@/lib/prisma-exports';

type EmbeddingJobWithArticle = EmbeddingJob & {
  article: Pick<Article, 'id' | 'title' | 'summary'> | null;
};

export interface JobProcessorOptions {
  skipEmbedding?: boolean; // For testing without API calls
}

export class JobProcessor {
  private pipeline?: ArticleEmbeddingPipeline;
  private options: JobProcessorOptions;

  constructor(options: JobProcessorOptions = {}) {
    this.options = options;
  }

  private getPipeline(): ArticleEmbeddingPipeline {
    if (!this.pipeline) {
      this.pipeline = new ArticleEmbeddingPipeline(prisma);
    }
    return this.pipeline;
  }

  /**
   * Process a single embedding job.
   * Handles article cascade delete gracefully.
   */
  async processJob(job: EmbeddingJobWithArticle): Promise<void> {
    // 取得したときのジョブ（要約は取得時点のもの）を、queuedAt で見分ける。要約を保存し直すと
    // 同じジョブが積み直され（PENDING・attempts 0・新しい queuedAt）、取得済みの要約は古くなる。
    // queuedAt は timestamptz(6)（SQL の既定値ならマイクロ秒まで入る）で、JS の Date はミリ秒までなので、
    // 一致ではなく、取得した値の前後 1ms に入るかで比べる（積み直しは要約を作り直した後なので、1ms より離れる）
    const fetchedQueuedAt = job.queuedAt.getTime();
    const sameQueuedAt = {
      gte: new Date(fetchedQueuedAt - 1),
      lte: new Date(fetchedQueuedAt + 1),
    };
    const claimedJob = {
      id: job.id,
      status: 'PROCESSING' as const,
      queuedAt: sameQueuedAt,
    };

    try {
      // Mark as processing (optimistic locking via status check)
      const updated = await prisma.embeddingJob.updateMany({
        where: {
          id: job.id,
          status: 'PENDING', // Only claim if still PENDING
          // 取得の後に積み直されたジョブは確保しない（次の回に新しい要約で処理する）
          queuedAt: sameQueuedAt,
        },
        data: {
          status: 'PROCESSING',
          attempts: { increment: 1 },
        },
      });

      // Job already claimed by another worker or re-queued after it was fetched
      if (updated.count === 0) {
        logger.debug(
          { jobId: job.id },
          'Job already claimed or re-queued, skipping'
        );
        return;
      }

      // Check if article still exists (cascade delete handling)
      if (!job.article || !job.article.summary) {
        logger.warn(
          { jobId: job.id },
          'Article deleted or has no summary, marking as skipped'
        );

        // Try to mark as SKIPPED (may fail if cascade deleted)
        try {
          await prisma.embeddingJob.updateMany({
            where: claimedJob,
            data: {
              status: 'FAILED',
              error: 'Article deleted or missing summary',
            },
          });
        } catch (error) {
          // Job likely deleted by cascade - this is OK
          logger.debug(
            { jobId: job.id, err: error },
            'Failed to update job status (likely cascade deleted)'
          );
        }
        return;
      }

      // Skip embedding generation if flag set (for testing)
      if (this.options.skipEmbedding) {
        logger.debug(
          { jobId: job.id },
          'Skipping embedding generation (test mode)'
        );

        await prisma.embeddingJob.updateMany({
          where: claimedJob,
          data: {
            status: 'COMPLETED',
            processedAt: new Date(),
          },
        });
        return;
      }

      // Generate embedding
      const result = await this.getPipeline().embedArticle(
        job.article as Article
      );

      // Check if job still exists (may have been cascade deleted during processing)
      const currentJob = await prisma.embeddingJob.findUnique({
        where: { id: job.id },
      });

      if (!currentJob) {
        logger.info(
          { jobId: job.id },
          'Job deleted during processing (article cascade)'
        );
        return;
      }

      if (result.success) {
        // 完了にするのは、確保したままのときだけ。処理中に積み直されていたら PENDING のまま残し、
        // 次の回に新しい要約で埋め込み直す
        await prisma.embeddingJob.updateMany({
          where: claimedJob,
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

        // 処理中に積み直されたジョブ（新しい要約の分）を、古い要約の失敗で上書きしない
        await prisma.embeddingJob.updateMany({
          where: claimedJob,
          data: {
            status: shouldRetry ? 'PENDING' : 'FAILED',
            error: result.error || 'Unknown error',
          },
        });

        logger.warn(
          {
            jobId: job.id,
            articleId: job.articleId,
            errorMessage: result.error,
            willRetry: shouldRetry,
          },
          'Embedding job failed'
        );
      }
    } catch (error) {
      // Handle unexpected errors
      // job は取得（attempts を 1 増やす）より前の値なので、上の失敗時と同じく +1 で比べる。
      // +1 しないと最後の試行の例外で attempts が上限のまま PENDING に戻り、ワーカーが二度と拾わない
      const shouldRetry = job.attempts + 1 < job.maxAttempts;

      try {
        const sanitized = sanitizeError(error);
        const safeMessage =
          typeof sanitized === 'string'
            ? sanitized
            : ((sanitized as any).message ?? 'Unknown error');

        // 処理中に積み直されたジョブを上書きしない（確保の前の例外なら PENDING のまま残る）
        await prisma.embeddingJob.updateMany({
          where: claimedJob,
          data: {
            status: shouldRetry ? 'PENDING' : 'FAILED',
            error: safeMessage,
          },
        });
      } catch (updateError) {
        // Job might have been deleted by cascade
        logger.debug(
          {
            jobId: job.id,
            err: updateError,
          },
          'Failed to update job (likely cascade deleted)'
        );
      }

      // Re-throw for Promise.allSettled
      throw error;
    }
  }
}
