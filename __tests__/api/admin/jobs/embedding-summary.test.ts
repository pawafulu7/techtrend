/**
 * Embedding Summary API Tests
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    embeddingJob: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

const mockWithRateLimit = jest.fn((_key: string, handler: any) => handler);
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: (...args: any[]) => (mockWithRateLimit as any)(...args),
}));

const mockWithAdminAuth = jest.fn((handler: any) => {
  return (request: any, context: any) => {
    return handler(request, {
      ...context,
      session: {
        user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' },
      },
    });
  };
});
jest.mock('@/lib/middleware/with-admin-auth', () => ({
  withAdminAuth: (handler: any) => (mockWithAdminAuth as any)(handler),
}));

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
  let GET: any;
  let withAdminAuthCalledOnLoad = false;
  let withRateLimitCallOnLoad: any[] | null = null;

  beforeAll(async () => {
    const adminAuthCallsBefore = mockWithAdminAuth.mock.calls.length;
    const rateLimitCallsBefore = mockWithRateLimit.mock.calls.length;
    const mod = await import('@/app/api/admin/jobs/embedding-summary/route');
    GET = mod.GET;
    withAdminAuthCalledOnLoad =
      mockWithAdminAuth.mock.calls.length > adminAuthCallsBefore;
    if (mockWithRateLimit.mock.calls.length > rateLimitCallsBefore) {
      withRateLimitCallOnLoad =
        mockWithRateLimit.mock.calls[rateLimitCallsBefore];
    }
  });

  beforeEach(() => {
    mockGroupBy.mockReset();
    mockFindMany.mockReset();
  });

  describe('Middleware wiring', () => {
    it('GET ハンドラが withAdminAuth でラップされて export されている', () => {
      expect(GET).toBeDefined();
      expect(typeof GET).toBe('function');
      expect(withAdminAuthCalledOnLoad).toBe(true);
    });

    it('withRateLimit が "admin:read" キーで handler 関数を受けて呼ばれている', () => {
      expect(withRateLimitCallOnLoad).not.toBeNull();
      expect(withRateLimitCallOnLoad![0]).toBe('admin:read');
      expect(typeof withRateLimitCallOnLoad![1]).toBe('function');
    });
  });

  describe('Authorized requests', () => {
    it('should return embedding job statistics', async () => {
      mockGroupBy.mockResolvedValue([
        { status: 'PENDING', _count: { status: 10 } },
        { status: 'PROCESSING', _count: { status: 5 } },
        { status: 'COMPLETED', _count: { status: 80 } },
        { status: 'FAILED', _count: { status: 5 } },
      ]);

      mockFindMany.mockResolvedValueOnce([]);
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

      const oldDate = new Date(Date.now() - 60 * 60 * 1000);
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
      mockFindMany.mockResolvedValueOnce([]);
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

      expect(mockFindMany).toHaveBeenCalled();
      const stuckJobsCall = mockFindMany.mock.calls[0][0];
      expect(stuckJobsCall.where.status).toBe('PROCESSING');
      expect(stuckJobsCall.where.queuedAt.lt).toBeDefined();

      const cutoffTime = stuckJobsCall.where.queuedAt.lt.getTime();
      const expectedCutoff = Date.now() - 60 * 60 * 1000;
      expect(Math.abs(cutoffTime - expectedCutoff)).toBeLessThan(60 * 1000);
    });
  });
});
