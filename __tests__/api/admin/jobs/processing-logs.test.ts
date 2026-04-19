/**
 * Processing Logs API Tests
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';

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
    processingLog: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_key: string, handler: any) => handler),
}));

jest.mock('@/lib/middleware/with-admin-auth', () => ({
  withAdminAuth: jest.fn((handler: any) => {
    return (request: any, context: any) => {
      return handler(request, {
        ...context,
        session: {
          user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' },
        },
      });
    };
  }),
}));

const mockWithRateLimit = withRateLimit as jest.MockedFunction<
  typeof withRateLimit
>;
const mockWithAdminAuth = withAdminAuth as jest.MockedFunction<
  typeof withAdminAuth
>;
const mockFindMany = prisma.processingLog.findMany as jest.Mock;

function createMockRequest(searchParams?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/admin/jobs/processing-logs');
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  return new NextRequest(url);
}

describe('GET /api/admin/jobs/processing-logs', () => {
  let GET: any;
  let withAdminAuthCalledOnLoad = false;
  let withRateLimitCallOnLoad: any[] | null = null;

  beforeAll(async () => {
    mockWithAdminAuth.mockClear();
    mockWithRateLimit.mockClear();
    const adminAuthCallsBefore = mockWithAdminAuth.mock.calls.length;
    const rateLimitCallsBefore = mockWithRateLimit.mock.calls.length;
    const mod = await import('@/app/api/admin/jobs/processing-logs/route');
    GET = mod.GET;
    withAdminAuthCalledOnLoad =
      mockWithAdminAuth.mock.calls.length > adminAuthCallsBefore;
    if (mockWithRateLimit.mock.calls.length > rateLimitCallsBefore) {
      withRateLimitCallOnLoad =
        mockWithRateLimit.mock.calls[rateLimitCallsBefore];
    }
  });

  beforeEach(() => {
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
    it('should return processing logs with summary', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          processName: 'collect-feeds',
          status: 'success',
          processedCount: 100,
          lastProcessedAt: new Date('2024-01-15T10:00:00Z'),
          metadata: { feeds: 10 },
        },
        {
          id: 'log-2',
          processName: 'generate-summaries',
          status: 'failed',
          processedCount: 0,
          lastProcessedAt: new Date('2024-01-15T09:00:00Z'),
          metadata: { error: 'API timeout' },
        },
      ];

      mockFindMany.mockResolvedValue(mockLogs);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.logs).toHaveLength(2);
      expect(data.summary.total).toBe(2);
      expect(data.summary.successCount).toBe(1);
      expect(data.summary.failedCount).toBe(1);
      expect(data.summary.successRate).toBe(50);
    });

    it('should return empty logs array when no logs exist', async () => {
      mockFindMany.mockResolvedValue([]);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.logs).toHaveLength(0);
      expect(data.summary.total).toBe(0);
      expect(data.summary.successRate).toBe(0);
    });

    it('should sanitize metadata by removing sensitive fields', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          processName: 'test-process',
          status: 'success',
          processedCount: 10,
          lastProcessedAt: new Date(),
          metadata: {
            apiKey: 'secret-key',
            token: 'secret-token',
            normalField: 'visible',
          },
        },
      ];

      mockFindMany.mockResolvedValue(mockLogs);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.logs[0].metadata).not.toHaveProperty('apiKey');
      expect(data.logs[0].metadata).not.toHaveProperty('token');
      expect(data.logs[0].metadata.normalField).toBe('visible');
    });

    it('should sanitize nested sensitive fields', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          processName: 'test-process',
          status: 'success',
          processedCount: 10,
          lastProcessedAt: new Date(),
          metadata: {
            auth: { token: 'secret' },
            config: {
              API_KEY: 'hidden',
              endpoint: 'https://api.example.com',
            },
            normalField: 'visible',
          },
        },
      ];

      mockFindMany.mockResolvedValue(mockLogs);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.logs[0].metadata).not.toHaveProperty('auth');
      expect(data.logs[0].metadata.config).not.toHaveProperty('API_KEY');
      expect(data.logs[0].metadata.config.endpoint).toBe(
        'https://api.example.com'
      );
      expect(data.logs[0].metadata.normalField).toBe('visible');
    });

    it('should respect days and limit query parameters', async () => {
      mockFindMany.mockResolvedValue([]);

      const request = createMockRequest({ days: '14', limit: '50' });
      await GET(request);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            lastProcessedAt: expect.objectContaining({ gte: expect.any(Date) }),
          }),
          take: 50,
        })
      );
    });

    it('should use default values for invalid parameters', async () => {
      mockFindMany.mockResolvedValue([]);

      const request = createMockRequest({ days: '-5', limit: '1000' });
      await GET(request);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 500,
        })
      );
    });

    it('should include Cache-Control header', async () => {
      mockFindMany.mockResolvedValue([]);

      const request = createMockRequest();
      const response = await GET(request);

      expect(response.headers.get('Cache-Control')).toBe(
        'private, no-cache, no-store, must-revalidate'
      );
    });
  });
});
