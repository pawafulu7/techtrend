/**
 * Embedding Summary API Tests
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/jobs/embedding-summary/route';
import { getSession } from '@/lib/auth/get-session';
import { prisma } from '@/lib/prisma';

// Mock dependencies
jest.mock('@/lib/auth/get-session');
jest.mock('@/lib/prisma', () => ({
  prisma: {
    embeddingJob: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

const mockAuth = getSession as jest.MockedFunction<typeof getSession>;
const mockGroupBy = prisma.embeddingJob.groupBy as jest.Mock;
const mockFindMany = prisma.embeddingJob.findMany as jest.Mock;

function createMockRequest(searchParams?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/admin/jobs/embedding-summary');
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  return new NextRequest(url);
}

describe('GET /api/admin/jobs/embedding-summary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 if not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized. Authentication required.');
    });

    it('should return 403 if user is not admin', async () => {
      mockAuth.mockResolvedValue({
        user: { id: '1', email: 'user@example.com', role: 'user' },
        session: { id: 's1', userId: '1', token: 'tok', expiresAt: new Date('2099-01-01') },
      });

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden. Admin access required.');
    });
  });

  describe('Authorized requests', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: { id: '1', email: 'admin@example.com', role: 'admin' },
        session: { id: 's1', userId: '1', token: 'tok', expiresAt: new Date('2099-01-01') },
      });
    });

    it('should return embedding job statistics', async () => {
      mockGroupBy.mockResolvedValue([
        { status: 'PENDING', _count: { status: 10 } },
        { status: 'PROCESSING', _count: { status: 5 } },
        { status: 'COMPLETED', _count: { status: 80 } },
        { status: 'FAILED', _count: { status: 5 } },
      ]);

      // Stuck jobs query
      mockFindMany.mockResolvedValueOnce([]);
      // High retry jobs query
      mockFindMany.mockResolvedValueOnce([]);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.statusCounts.PENDING).toBe(10);
      expect(data.statusCounts.PROCESSING).toBe(5);
      expect(data.statusCounts.COMPLETED).toBe(80);
      expect(data.statusCounts.FAILED).toBe(5);
      expect(data.statusCounts.total).toBe(100);
      expect(data.completionRate).toBe(80);
    });

    it('should detect stuck jobs', async () => {
      mockGroupBy.mockResolvedValue([
        { status: 'PROCESSING', _count: { status: 2 } },
      ]);

      const oldDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      mockFindMany.mockResolvedValueOnce([
        {
          id: 'job-1',
          articleId: 'article-1',
          queuedAt: oldDate,
          attempts: 3,
        },
      ]);
      mockFindMany.mockResolvedValueOnce([]);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.stuckJobs).toHaveLength(1);
      expect(data.stuckJobs[0].articleId).toBe('article-1');
      expect(data.stuckJobs[0].durationMinutes).toBeGreaterThanOrEqual(60);
    });

    it('should detect high retry jobs', async () => {
      mockGroupBy.mockResolvedValue([]);
      mockFindMany.mockResolvedValueOnce([]); // Stuck jobs
      mockFindMany.mockResolvedValueOnce([
        {
          id: 'job-1',
          articleId: 'article-1',
          attempts: 3,
          maxAttempts: 5,
          error: 'Connection timeout',
        },
      ]);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.highRetryJobs).toHaveLength(1);
      expect(data.highRetryJobs[0].attempts).toBe(3);
      expect(data.highRetryJobs[0].retriesRemaining).toBe(2);
      expect(data.highRetryJobs[0].error).toBe('Connection timeout');
    });

    it('should handle empty database', async () => {
      mockGroupBy.mockResolvedValue([]);
      mockFindMany.mockResolvedValue([]);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.statusCounts.total).toBe(0);
      expect(data.completionRate).toBe(0);
      expect(data.stuckJobs).toHaveLength(0);
      expect(data.highRetryJobs).toHaveLength(0);
    });

    it('should respect custom stuckThreshold parameter', async () => {
      mockGroupBy.mockResolvedValue([]);
      mockFindMany.mockResolvedValue([]);

      const request = createMockRequest({ stuckThreshold: '60' });
      await GET(request);

      // Verify the findMany was called with correct cutoff time (60 minutes ago)
      expect(mockFindMany).toHaveBeenCalled();
      const stuckJobsCall = mockFindMany.mock.calls[0][0];
      expect(stuckJobsCall.where.status).toBe('PROCESSING');
      expect(stuckJobsCall.where.queuedAt.lt).toBeDefined();

      // Verify the cutoff is approximately 60 minutes ago (within 1 minute tolerance)
      const cutoffTime = stuckJobsCall.where.queuedAt.lt.getTime();
      const expectedCutoff = Date.now() - 60 * 60 * 1000;
      expect(Math.abs(cutoffTime - expectedCutoff)).toBeLessThan(60 * 1000);
    });
  });
});
