/**
 * Processing Logs API Tests
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/jobs/processing-logs/route';
import { getSession } from '@/lib/auth/get-session';
import { prisma } from '@/lib/prisma';

// Mock dependencies
jest.mock('@/lib/auth/get-session');
jest.mock('@/lib/prisma', () => ({
  prisma: {
    processingLog: {
      findMany: jest.fn(),
    },
  },
}));

const mockAuth = getSession as jest.MockedFunction<typeof getSession>;
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

      // Top-level auth key should be removed
      expect(data.logs[0].metadata).not.toHaveProperty('auth');
      // Nested API_KEY should be removed
      expect(data.logs[0].metadata.config).not.toHaveProperty('API_KEY');
      // Non-sensitive fields should remain
      expect(data.logs[0].metadata.config.endpoint).toBe('https://api.example.com');
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

      // Invalid days (-5) should default to 7, limit (1000) should be capped at 500
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
