import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import type { Article, PrismaClient } from '@prisma/client';

// Ensure Next.js server APIs are mocked in Jest (Node env)
jest.mock('next/server');
// Unmock Prisma client to use real implementation (overrides jest.setup.node.js global mock)
jest.mock('@prisma/client', () => jest.requireActual('@prisma/client'));
// Mock @/lib/prisma to use real Prisma client instead of mock
jest.mock('@/lib/prisma', () => jest.requireActual('../../../lib/prisma'));

// Import route handler AFTER mock setup
import { GET } from '@/app/api/workers/embedding/route';

// Use real Prisma client (bypass mock) with production DB protection
const { PrismaClient: RealPrismaClient } = jest.requireActual('@prisma/client');
const DB_URL = process.env.DATABASE_URL;
const isSafeTestDb = !!DB_URL && /(localhost|127\.0\.0\.1|test|_test)/i.test(DB_URL);
const describeIf = isSafeTestDb ? describe : describe.skip;
let prisma: PrismaClient;

describeIf('GET /api/workers/embedding', () => {
  let testArticles: Article[] = [];
  let testSource: { id: string };

  beforeAll(async () => {
    // Lazily create client when tests actually run
    prisma = new RealPrismaClient({
      datasources: { db: { url: DB_URL! } },
    });
    await prisma.$connect();

    // Always create an isolated test source
    testSource = await prisma.source.create({
      data: {
        name: `Test Source for Worker ${Date.now()}`,
        url: `https://example.com/test-source-${Date.now()}`,
        type: 'RSS',
        enabled: true,
      },
    });

    // Create test articles with jobs
    for (let i = 0; i < 3; i++) {
      const article = await prisma.article.create({
        data: {
          title: `Worker Test Article ${i}`,
          url: `https://example.com/worker-test-${i}-${Date.now()}`,
          summary: `Worker test summary ${i}`,
          sourceId: testSource.id,
          publishedAt: new Date(),
        },
      });

      await prisma.embeddingJob.create({
        data: {
          articleId: article.id,
          status: 'PENDING',
        },
      });

      testArticles.push(article);
    }
  });

  afterAll(async () => {
    // Cleanup - jobs cascade when articles deleted
    const articleIds = testArticles.map((a) => a.id);
    await prisma.article.deleteMany({
      where: { id: { in: articleIds } },
    });

    // Delete test source
    await prisma.source.delete({
      where: { id: testSource.id },
    });

    // Disconnect from database
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Reset jobs to PENDING before each test
    const articleIds = testArticles.map((a) => a.id);
    await prisma.embeddingJob.updateMany({
      where: { articleId: { in: articleIds } },
      data: {
        status: 'PENDING',
        attempts: 0,
        error: null,
        processedAt: null,
      },
    });
  });

  it('should reject request without Vercel Cron header', async () => {
    const request = new NextRequest('http://localhost:3000/api/workers/embedding');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Unauthorized');
  });

  it('should process pending jobs with valid Cron header', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/workers/embedding?skip_embedding=true',
      {
        headers: { 'x-vercel-cron': '1' },
      }
    );

    const response = await GET(request);
    const data = await response.json();

    // Debug: log error if status is not 200
    if (response.status !== 200) {
      console.error('Worker failed with status:', response.status);
      console.error('Error data:', data);
    }

    expect(response.status).toBe(200);
    expect(data.status).toMatch(/completed|idle/);
    expect(data.processed).toBeGreaterThanOrEqual(0);

    if (data.status === 'completed') {
      expect(data.succeeded).toBeGreaterThan(0);
      expect(data.durationMs).toBeGreaterThan(0);
    }

    // Verify DB state (jobs marked COMPLETED)
    const ids = testArticles.map((a) => a.id);
    const jobs = await prisma.embeddingJob.findMany({
      where: { articleId: { in: ids } },
      select: { status: true, processedAt: true },
    });

    // At least some jobs should be COMPLETED
    expect(jobs.some((j) => j.status === 'COMPLETED')).toBe(true);

    // COMPLETED jobs should have processedAt
    jobs
      .filter((j) => j.status === 'COMPLETED')
      .forEach((j) => expect(j.processedAt).not.toBeNull());
  });

  it('should return idle status when no jobs', async () => {
    // Mark ALL pending jobs as completed (not just test articles)
    await prisma.embeddingJob.updateMany({
      where: { status: 'PENDING' },
      data: { status: 'COMPLETED' },
    });

    const request = new NextRequest('http://localhost:3000/api/workers/embedding', {
      headers: { 'x-vercel-cron': '1' },
    });

    const response = await GET(request);
    const data = await response.json();

    // Debug: log error if status is not 200
    if (response.status !== 200) {
      console.error('Worker failed with status:', response.status);
      console.error('Error data:', data);
    }

    expect(response.status).toBe(200);
    expect(data.status).toBe('idle');
    expect(data.processed).toBe(0);
    expect(data.message).toBe('No pending jobs');
  });

  it('should not crash when jobs are cascade-deleted with articles', async () => {
    // Create article with job using the same test source
    const article = await prisma.article.create({
      data: {
        title: 'To Be Deleted',
        url: `https://example.com/to-delete-${Date.now()}`,
        summary: 'Will be deleted',
        sourceId: testSource.id,
        publishedAt: new Date(),
      },
    });

    await prisma.embeddingJob.create({
      data: {
        articleId: article.id,
        status: 'PENDING',
      },
    });

    // Delete article (cascade deletes job)
    await prisma.article.delete({
      where: { id: article.id },
    });

    // Worker should handle gracefully
    const request = new NextRequest(
      'http://localhost:3000/api/workers/embedding?skip_embedding=true',
      {
        headers: { 'x-vercel-cron': '1' },
      }
    );

    const response = await GET(request);
    const data = await response.json();

    // Debug: log error if status is not 200
    if (response.status !== 200) {
      console.error('Worker failed with status:', response.status);
      console.error('Error data:', data);
    }

    expect(response.status).toBe(200);
    // Should complete without errors
    expect(data.status).toMatch(/completed|idle/);
  });
});
