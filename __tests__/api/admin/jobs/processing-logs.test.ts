/**
 * Processing Logs API Tests
 */

import { GET } from '@/app/api/admin/jobs/processing-logs/route';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';

// Mock dependencies
jest.mock('@/lib/auth/auth');
jest.mock('@/lib/prisma', () => ({
  prisma: {
    processingLog: {
      findMany: jest.fn(),
    },
  },
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockFindMany = prisma.processingLog.findMany as jest.Mock;

describe('GET /api/admin/jobs/processing-logs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 if not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized. Admin access required.');
    });

    it('should return 401 if user is not admin', async () => {
      mockAuth.mockResolvedValue({
        user: { id: '1', email: 'user@example.com', role: 'user' },
        expires: '2099-01-01',
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized. Admin access required.');
    });
  });

  describe('Authorized requests', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: { id: '1', email: 'admin@example.com', role: 'admin' },
        expires: '2099-01-01',
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

      const response = await GET();
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

      const response = await GET();
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

      const response = await GET();
      const data = await response.json();

      expect(data.logs[0].metadata).not.toHaveProperty('apiKey');
      expect(data.logs[0].metadata).not.toHaveProperty('token');
      expect(data.logs[0].metadata.normalField).toBe('visible');
    });

    it('should include Cache-Control header', async () => {
      mockFindMany.mockResolvedValue([]);

      const response = await GET();

      expect(response.headers.get('Cache-Control')).toBe(
        'private, no-cache, no-store, must-revalidate'
      );
    });
  });
});
