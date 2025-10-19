import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { prisma } from '@/lib/prisma';
import { EmbeddingScheduler } from '@/lib/services/embedding-scheduler';
import type { Article } from '@prisma/client';

describe('EmbeddingScheduler', () => {
  let scheduler: EmbeddingScheduler;
  let testArticle: Article;

  beforeEach(async () => {
    scheduler = new EmbeddingScheduler();

    // Get first available source
    const source = await prisma.source.findFirst();
    if (!source) {
      throw new Error('No source found in database');
    }

    // Create test article
    testArticle = await prisma.article.create({
      data: {
        title: 'Test Article for Scheduler',
        url: `https://example.com/test-scheduler-${Date.now()}`,
        summary: 'Test summary for embedding scheduler',
        sourceId: source.id,
        publishedAt: new Date(),
      },
    });
  });

  afterEach(async () => {
    // Cleanup - embeddingJob cascades when article is deleted
    await prisma.article.delete({
      where: { id: testArticle.id },
    });
  });

  describe('enqueue', () => {
    it('should create new job if not exists', async () => {
      await scheduler.enqueue(testArticle.id);

      const job = await prisma.embeddingJob.findUnique({
        where: { articleId: testArticle.id },
      });

      expect(job).not.toBeNull();
      expect(job?.status).toBe('PENDING');
      expect(job?.attempts).toBe(0);
      expect(job?.articleId).toBe(testArticle.id);
    });

    it('should re-queue COMPLETED job to PENDING', async () => {
      // Create completed job
      await prisma.embeddingJob.create({
        data: {
          articleId: testArticle.id,
          status: 'COMPLETED',
          attempts: 1,
          processedAt: new Date(),
        },
      });

      // Re-queue
      await scheduler.enqueue(testArticle.id);

      const job = await prisma.embeddingJob.findUnique({
        where: { articleId: testArticle.id },
      });

      expect(job?.status).toBe('PENDING');
      expect(job?.attempts).toBe(0);
      expect(job?.processedAt).toBeNull();
      expect(job?.error).toBeNull();
    });

    it('should re-queue FAILED job to PENDING', async () => {
      // Create failed job
      await prisma.embeddingJob.create({
        data: {
          articleId: testArticle.id,
          status: 'FAILED',
          attempts: 3,
          error: 'Previous failure',
        },
      });

      // Re-queue
      await scheduler.enqueue(testArticle.id);

      const job = await prisma.embeddingJob.findUnique({
        where: { articleId: testArticle.id },
      });

      expect(job?.status).toBe('PENDING');
      expect(job?.attempts).toBe(0);
      expect(job?.error).toBeNull();
    });

    it('should update queuedAt when re-queuing', async () => {
      const oldQueuedAt = new Date('2025-01-01');

      // Create old job
      await prisma.embeddingJob.create({
        data: {
          articleId: testArticle.id,
          status: 'PENDING',
          queuedAt: oldQueuedAt,
        },
      });

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Re-queue
      await scheduler.enqueue(testArticle.id);

      const job = await prisma.embeddingJob.findUnique({
        where: { articleId: testArticle.id },
      });

      expect(job?.queuedAt.getTime()).toBeGreaterThan(oldQueuedAt.getTime());
    });
  });

  describe('getPendingJobs', () => {
    it('should return jobs ordered by queuedAt DESC (newest first)', async () => {
      // Get first available source
      const source = await prisma.source.findFirst();
      if (!source) {
        throw new Error('No source found in database');
      }

      // Create 3 articles with jobs at different times
      const article1 = await prisma.article.create({
        data: {
          title: 'Article 1',
          url: `https://example.com/test-1-${Date.now()}`,
          sourceId: source.id,
          publishedAt: new Date(),
        },
      });

      const article2 = await prisma.article.create({
        data: {
          title: 'Article 2',
          url: `https://example.com/test-2-${Date.now()}`,
          sourceId: source.id,
          publishedAt: new Date(),
        },
      });

      const article3 = await prisma.article.create({
        data: {
          title: 'Article 3',
          url: `https://example.com/test-3-${Date.now()}`,
          sourceId: source.id,
          publishedAt: new Date(),
        },
      });

      await prisma.embeddingJob.createMany({
        data: [
          { articleId: article1.id, status: 'PENDING', queuedAt: new Date('2025-01-01') },
          { articleId: article2.id, status: 'PENDING', queuedAt: new Date('2025-01-03') }, // Newest
          { articleId: article3.id, status: 'PENDING', queuedAt: new Date('2025-01-02') },
        ],
      });

      const jobs = await scheduler.getPendingJobs(10);

      expect(jobs.length).toBe(3);
      expect(jobs[0].articleId).toBe(article2.id); // Newest first
      expect(jobs[1].articleId).toBe(article3.id);
      expect(jobs[2].articleId).toBe(article1.id);

      // Cleanup
      await prisma.article.deleteMany({
        where: { id: { in: [article1.id, article2.id, article3.id] } },
      });
    });

    it('should exclude jobs with attempts >= 3', async () => {
      await prisma.embeddingJob.create({
        data: {
          articleId: testArticle.id,
          status: 'PENDING',
          attempts: 3,
        },
      });

      const jobs = await scheduler.getPendingJobs(10);

      expect(jobs.length).toBe(0);
    });

    it('should only return PENDING jobs', async () => {
      await prisma.embeddingJob.create({
        data: {
          articleId: testArticle.id,
          status: 'COMPLETED',
        },
      });

      const jobs = await scheduler.getPendingJobs(10);

      expect(jobs.length).toBe(0);
    });

    it('should include article data', async () => {
      await prisma.embeddingJob.create({
        data: {
          articleId: testArticle.id,
          status: 'PENDING',
        },
      });

      const jobs = await scheduler.getPendingJobs(10);

      expect(jobs.length).toBe(1);
      expect(jobs[0].article).toBeDefined();
      expect(jobs[0].article.id).toBe(testArticle.id);
      expect(jobs[0].article.title).toBe(testArticle.title);
      expect(jobs[0].article.summary).toBe(testArticle.summary);
    });
  });

  describe('getFailedJobs', () => {
    it('should return FAILED jobs only', async () => {
      await prisma.embeddingJob.createMany({
        data: [
          { articleId: testArticle.id, status: 'FAILED', error: 'Test error' },
        ],
      });

      const jobs = await scheduler.getFailedJobs(10);

      expect(jobs.length).toBe(1);
      expect(jobs[0].status).toBe('FAILED');
      expect(jobs[0].error).toBe('Test error');
    });
  });

  describe('retryFailed', () => {
    it('should reset failed job to PENDING', async () => {
      const job = await prisma.embeddingJob.create({
        data: {
          articleId: testArticle.id,
          status: 'FAILED',
          attempts: 3,
          error: 'Previous failure',
        },
      });

      await scheduler.retryFailed(job.id);

      const updatedJob = await prisma.embeddingJob.findUnique({
        where: { id: job.id },
      });

      expect(updatedJob?.status).toBe('PENDING');
      expect(updatedJob?.attempts).toBe(0);
      expect(updatedJob?.error).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return job statistics', async () => {
      // Get first available source
      const source = await prisma.source.findFirst();
      if (!source) {
        throw new Error('No source found in database');
      }

      // Create multiple test articles for stats
      const articles = await Promise.all([
        prisma.article.create({
          data: {
            title: 'Stats Test 1',
            url: `https://example.com/stats-1-${Date.now()}`,
            sourceId: source.id,
            publishedAt: new Date(),
          },
        }),
        prisma.article.create({
          data: {
            title: 'Stats Test 2',
            url: `https://example.com/stats-2-${Date.now()}`,
            sourceId: source.id,
            publishedAt: new Date(),
          },
        }),
      ]);

      await prisma.embeddingJob.createMany({
        data: [
          { articleId: articles[0].id, status: 'PENDING' },
          { articleId: articles[1].id, status: 'FAILED', error: 'Test' },
        ],
      });

      const stats = await scheduler.getStats();

      expect(stats.pending).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.total).toBe(2);

      // Cleanup
      await prisma.article.deleteMany({
        where: { id: { in: articles.map((a) => a.id) } },
      });
    });
  });
});
