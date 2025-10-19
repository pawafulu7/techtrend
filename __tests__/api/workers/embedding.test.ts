import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/workers/embedding/route';
import { prisma } from '@/lib/prisma';
import type { Article } from '@prisma/client';

describe('GET /api/workers/embedding', () => {
  let testArticles: Article[] = [];

  beforeAll(async () => {
    // Get first available source
    const source = await prisma.source.findFirst();
    if (!source) {
      throw new Error('No source found in database');
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
    const source = await prisma.source.findFirst();
    if (!source) {
      throw new Error('No source found');
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

  it('should respect skip_embedding flag for testing', async () => {
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

    // Jobs should be marked completed (not actually embedded)
    if (data.processed > 0) {
      expect(data.succeeded).toBeGreaterThan(0);
    }
  });
});
