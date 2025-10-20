import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import type { Article, PrismaClient } from '@prisma/client';

// Mock @/lib/prisma to use real Prisma client instead of mock
jest.mock('@/lib/prisma', () => jest.requireActual('../../../lib/prisma'));

// Import route handler AFTER mock setup
import { GET } from '@/app/api/workers/embedding/route';

// Use real Prisma client (bypass mock) with production DB protection
const { PrismaClient: RealPrismaClient } = jest.requireActual('@prisma/client');
const DB_URL = process.env.DATABASE_URL;
const isSafeTestDb = !!DB_URL && /(localhost|127\.0\.0\.1|test|_test)/i.test(DB_URL);

if (!isSafeTestDb) {
  throw new Error(
    'DATABASE_URL must be set and point to a test database (localhost/test). ' +
      'Current: ' +
      (DB_URL || 'undefined')
  );
}

const prisma: PrismaClient = new RealPrismaClient({
  datasources: {
    db: {
      url: DB_URL,
    },
  },
});

describe('GET /api/workers/embedding', () => {
  let testArticles: Article[] = [];

  beforeAll(async () => {
    // Connect to real database
    await prisma.$connect();

    // Get or create first available source
    let source = await prisma.source.findFirst();
    if (!source) {
      // Create a test source if none exists
      source = await prisma.source.create({
        data: {
          name: 'Test Source for Worker',
          url: 'https://example.com/test-source',
          type: 'RSS',
          enabled: true,
        },
      });
    }

    // Create test articles with jobs
    for (let i = 0; i < 3; i++) {
      const article = await prisma.article.create({
        data: {
          title: `Worker Test Article ${i}`,
          url: `https://example.com/worker-test-${i}-${Date.now()}`,
          summary: `Worker test summary ${i}`,
          sourceId: source.id,
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
    // Mark all jobs as completed
    const articleIds = testArticles.map((a) => a.id);
    await prisma.embeddingJob.updateMany({
      where: { articleId: { in: articleIds } },
      data: { status: 'COMPLETED' },
    });

    const request = new NextRequest('http://localhost:3000/api/workers/embedding', {
      headers: { 'x-vercel-cron': '1' },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('idle');
    expect(data.processed).toBe(0);
    expect(data.message).toBe('No pending jobs');
  });

  it('should handle article cascade delete gracefully', async () => {
    // Create article with job, then delete article
    let source = await prisma.source.findFirst();
    if (!source) {
      // Create a test source if none exists
      source = await prisma.source.create({
        data: {
          name: 'Test Source for Cascade Delete',
          url: 'https://example.com/test-cascade',
          type: 'RSS',
          enabled: true,
        },
      });
    }

    const article = await prisma.article.create({
      data: {
        title: 'To Be Deleted',
        url: `https://example.com/to-delete-${Date.now()}`,
        summary: 'Will be deleted',
        sourceId: source.id,
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

    expect(response.status).toBe(200);
    // Should complete without errors
    expect(data.status).toMatch(/completed|idle/);
  });
});
