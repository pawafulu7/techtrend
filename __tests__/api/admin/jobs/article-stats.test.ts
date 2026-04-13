/**
 * Article Stats API Tests
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/jobs/article-stats/route';
import { getSession } from '@/lib/auth/get-session';
import { prisma } from '@/lib/prisma';

// Mock dependencies
jest.mock('@/lib/auth/get-session');
jest.mock('@/lib/prisma', () => ({
  prisma: {
    article: {
      findMany: jest.fn(),
    },
  },
}));

const mockAuth = getSession as jest.MockedFunction<typeof getSession>;
const mockFindMany = prisma.article.findMany as jest.Mock;

function createMockRequest(searchParams?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/admin/jobs/article-stats');
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  return new NextRequest(url);
}

describe('GET /api/admin/jobs/article-stats', () => {
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

    it('should return article statistics by source', async () => {
      const mockArticles = [
        {
          id: '1',
          source: { name: 'Zenn' },
          createdAt: new Date('2024-01-15'),
          summary: 'Test summary',
        },
        {
          id: '2',
          source: { name: 'Zenn' },
          createdAt: new Date('2024-01-15'),
          summary: 'Another summary',
        },
        {
          id: '3',
          source: { name: 'Qiita' },
          createdAt: new Date('2024-01-15'),
          summary: null,
        },
      ];

      mockFindMany.mockResolvedValue(mockArticles);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.bySource).toHaveLength(2);

      const zennStats = data.bySource.find(
        (s: { source: string }) => s.source === 'Zenn'
      );
      expect(zennStats.count).toBe(2);

      const qiitaStats = data.bySource.find(
        (s: { source: string }) => s.source === 'Qiita'
      );
      expect(qiitaStats.count).toBe(1);
    });

    it('should calculate summary rate correctly', async () => {
      const mockArticles = [
        { id: '1', source: { name: 'Test' }, createdAt: new Date(), summary: 'Yes' },
        { id: '2', source: { name: 'Test' }, createdAt: new Date(), summary: 'Yes' },
        { id: '3', source: { name: 'Test' }, createdAt: new Date(), summary: null },
        { id: '4', source: { name: 'Test' }, createdAt: new Date(), summary: '' },
      ];

      mockFindMany.mockResolvedValue(mockArticles);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.totals.articles).toBe(4);
      expect(data.totals.summaries).toBe(2);
      expect(data.totals.overallRate).toBe(50);
    });

    it('should handle empty database', async () => {
      mockFindMany.mockResolvedValue([]);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.bySource).toHaveLength(0);
      expect(data.totals.articles).toBe(0);
      expect(data.totals.overallRate).toBe(0);
    });

    it('should respect range parameter', async () => {
      mockFindMany.mockResolvedValue([]);

      const request = createMockRequest({ range: '14d' });
      await GET(request);

      expect(mockFindMany).toHaveBeenCalled();
      const callArg = mockFindMany.mock.calls[0][0];
      expect(callArg.where.createdAt.gte).toBeDefined();
    });

    it('should sort sources by count descending', async () => {
      const mockArticles = [
        { id: '1', source: { name: 'Small' }, createdAt: new Date(), summary: null },
        { id: '2', source: { name: 'Large' }, createdAt: new Date(), summary: null },
        { id: '3', source: { name: 'Large' }, createdAt: new Date(), summary: null },
        { id: '4', source: { name: 'Large' }, createdAt: new Date(), summary: null },
        { id: '5', source: { name: 'Medium' }, createdAt: new Date(), summary: null },
        { id: '6', source: { name: 'Medium' }, createdAt: new Date(), summary: null },
      ];

      mockFindMany.mockResolvedValue(mockArticles);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.bySource[0].source).toBe('Large');
      expect(data.bySource[1].source).toBe('Medium');
      expect(data.bySource[2].source).toBe('Small');
    });

    it('should handle articles without source', async () => {
      const mockArticles = [
        { id: '1', source: null, createdAt: new Date(), summary: 'Yes' },
        { id: '2', source: { name: 'Test' }, createdAt: new Date(), summary: 'Yes' },
      ];

      mockFindMany.mockResolvedValue(mockArticles);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      const unknownStats = data.bySource.find(
        (s: { source: string }) => s.source === 'Unknown'
      );
      expect(unknownStats).toBeDefined();
      expect(unknownStats.count).toBe(1);
    });
  });
});
