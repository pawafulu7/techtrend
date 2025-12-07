import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import { EmbeddingScheduler } from '@/lib/services/embedding-scheduler';
import type { Article, PrismaClient } from '@prisma/client';

// Use real Prisma client (bypass mock)
const { PrismaClient: RealPrismaClient } = jest.requireActual('@prisma/client');
const prisma: PrismaClient = new RealPrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL!,
    },
  },
});

describe('EmbeddingScheduler', () => {
  let scheduler: EmbeddingScheduler;
  let testArticle: Article;
  let testSourceId: string;

  beforeAll(async () => {
    // Connect to real database
    await prisma.$connect();

    // Use first source from seed data
    const source = await prisma.source.findFirst();
    if (!source) {
      throw new Error('No source found - seed-test.ts must run before tests');
    }
    testSourceId = source.id;
  });

  afterAll(async () => {
    // Disconnect from database
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Pass real prisma to scheduler
    scheduler = new EmbeddingScheduler(prisma);

    // Clear embedding jobs to avoid state bleed
    await prisma.embeddingJob.deleteMany();

    // Create test article
    testArticle = await prisma.article.create({
      data: {
        title: 'Test Article for Scheduler',
        url: `https://example.com/test-scheduler-${Date.now()}`,
        summary: 'Test summary for embedding scheduler',
        sourceId: testSourceId,
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
      // Create 3 articles with jobs at different times
      const article1 = await prisma.article.create({
        data: {
          title: 'Article 1',
          url: `https://example.com/test-1-${Date.now()}`,
          sourceId: testSourceId,
          publishedAt: new Date(),
        },
      });

      const article2 = await prisma.article.create({
        data: {
          title: 'Article 2',
          url: `https://example.com/test-2-${Date.now()}`,
          sourceId: testSourceId,
          publishedAt: new Date(),
        },
      });

      const article3 = await prisma.article.create({
        data: {
          title: 'Article 3',
          url: `https://example.com/test-3-${Date.now()}`,
          sourceId: testSourceId,
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
      // Create multiple test articles for stats
      const articles = await Promise.all([
        prisma.article.create({
          data: {
            title: 'Stats Test 1',
            url: `https://example.com/stats-1-${Date.now()}`,
            sourceId: testSourceId,
            publishedAt: new Date(),
          },
        }),
        prisma.article.create({
          data: {
            title: 'Stats Test 2',
            url: `https://example.com/stats-2-${Date.now()}`,
            sourceId: testSourceId,
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

  describe('recoverStuckJobs', () => {
    it('should return zeros when no stuck jobs exist', async () => {
      const result = await scheduler.recoverStuckJobs(30, 100);

      expect(result.found).toBe(0);
      expect(result.reset).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.oldestAgeMinutes).toBeUndefined();
    });

    it('should reset PROCESSING jobs older than threshold to PENDING', async () => {
      // Create a job that has been PROCESSING for 60 minutes
      const oldQueuedAt = new Date(Date.now() - 60 * 60 * 1000);

      await prisma.embeddingJob.create({
        data: {
          articleId: testArticle.id,
          status: 'PROCESSING',
          attempts: 1,
          queuedAt: oldQueuedAt,
        },
      });

      // Recover with 30 minute threshold
      const result = await scheduler.recoverStuckJobs(30, 100);

      expect(result.found).toBe(1);
      expect(result.reset).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.oldestAgeMinutes).toBeGreaterThanOrEqual(59);

      // Verify job was reset to PENDING
      const job = await prisma.embeddingJob.findUnique({
        where: { articleId: testArticle.id },
      });
      expect(job?.status).toBe('PENDING');
      // Attempts should NOT be reset (to prevent infinite loops)
      expect(job?.attempts).toBe(1);
    });

    it('should not reset PROCESSING jobs newer than threshold', async () => {
      // Create a job that has been PROCESSING for only 10 minutes
      const recentQueuedAt = new Date(Date.now() - 10 * 60 * 1000);

      await prisma.embeddingJob.create({
        data: {
          articleId: testArticle.id,
          status: 'PROCESSING',
          attempts: 1,
          queuedAt: recentQueuedAt,
        },
      });

      // Recover with 30 minute threshold
      const result = await scheduler.recoverStuckJobs(30, 100);

      expect(result.found).toBe(0);
      expect(result.reset).toBe(0);

      // Verify job is still PROCESSING
      const job = await prisma.embeddingJob.findUnique({
        where: { articleId: testArticle.id },
      });
      expect(job?.status).toBe('PROCESSING');
    });

    it('should skip jobs that exceeded maxAttempts', async () => {
      // Create a stuck job with attempts >= maxAttempts (default 3)
      const oldQueuedAt = new Date(Date.now() - 60 * 60 * 1000);

      await prisma.embeddingJob.create({
        data: {
          articleId: testArticle.id,
          status: 'PROCESSING',
          attempts: 3,
          maxAttempts: 3,
          queuedAt: oldQueuedAt,
        },
      });

      const result = await scheduler.recoverStuckJobs(30, 100);

      expect(result.found).toBe(1);
      expect(result.reset).toBe(0);
      expect(result.skipped).toBe(1);

      // Verify job is still PROCESSING (not reset)
      const job = await prisma.embeddingJob.findUnique({
        where: { articleId: testArticle.id },
      });
      expect(job?.status).toBe('PROCESSING');
    });

    it('should respect batch limit', async () => {
      // Create 3 articles with stuck jobs
      const articles = await Promise.all([
        prisma.article.create({
          data: {
            title: 'Batch Test 1',
            url: `https://example.com/batch-1-${Date.now()}`,
            sourceId: testSourceId,
            publishedAt: new Date(),
          },
        }),
        prisma.article.create({
          data: {
            title: 'Batch Test 2',
            url: `https://example.com/batch-2-${Date.now()}`,
            sourceId: testSourceId,
            publishedAt: new Date(),
          },
        }),
        prisma.article.create({
          data: {
            title: 'Batch Test 3',
            url: `https://example.com/batch-3-${Date.now()}`,
            sourceId: testSourceId,
            publishedAt: new Date(),
          },
        }),
      ]);

      const oldQueuedAt = new Date(Date.now() - 60 * 60 * 1000);

      await prisma.embeddingJob.createMany({
        data: articles.map((a) => ({
          articleId: a.id,
          status: 'PROCESSING' as const,
          attempts: 1,
          queuedAt: oldQueuedAt,
        })),
      });

      // Recover with limit of 2
      const result = await scheduler.recoverStuckJobs(30, 2);

      expect(result.found).toBe(2); // Limited to 2
      expect(result.reset).toBe(2);

      // Cleanup
      await prisma.article.deleteMany({
        where: { id: { in: articles.map((a) => a.id) } },
      });
    });

    it('should calculate oldestAgeMinutes correctly', async () => {
      // Create jobs at different ages
      const age90min = new Date(Date.now() - 90 * 60 * 1000);
      const age45min = new Date(Date.now() - 45 * 60 * 1000);

      const article2 = await prisma.article.create({
        data: {
          title: 'Age Test',
          url: `https://example.com/age-test-${Date.now()}`,
          sourceId: testSourceId,
          publishedAt: new Date(),
        },
      });

      await prisma.embeddingJob.createMany({
        data: [
          { articleId: testArticle.id, status: 'PROCESSING', queuedAt: age90min, attempts: 1 },
          { articleId: article2.id, status: 'PROCESSING', queuedAt: age45min, attempts: 1 },
        ],
      });

      const result = await scheduler.recoverStuckJobs(30, 100);

      // Oldest should be ~90 minutes (allow some margin)
      expect(result.oldestAgeMinutes).toBeGreaterThanOrEqual(89);
      expect(result.oldestAgeMinutes).toBeLessThanOrEqual(91);

      // Cleanup
      await prisma.article.delete({ where: { id: article2.id } });
    });

    it('should not reset PENDING or COMPLETED jobs', async () => {
      const oldQueuedAt = new Date(Date.now() - 60 * 60 * 1000);

      // Create PENDING and COMPLETED jobs (not PROCESSING)
      const article2 = await prisma.article.create({
        data: {
          title: 'Status Test',
          url: `https://example.com/status-test-${Date.now()}`,
          sourceId: testSourceId,
          publishedAt: new Date(),
        },
      });

      await prisma.embeddingJob.createMany({
        data: [
          { articleId: testArticle.id, status: 'PENDING', queuedAt: oldQueuedAt },
          { articleId: article2.id, status: 'COMPLETED', queuedAt: oldQueuedAt },
        ],
      });

      const result = await scheduler.recoverStuckJobs(30, 100);

      expect(result.found).toBe(0);
      expect(result.reset).toBe(0);

      // Cleanup
      await prisma.article.delete({ where: { id: article2.id } });
    });
  });
});
