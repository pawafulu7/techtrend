import { GET } from '@/app/api/trends/analysis/route';
import { createMockRequest } from '@/test/helpers/api';

// Mock dependencies
const mockQueryRaw = jest.fn();
jest.mock('@/lib/database', () => ({
  prisma: {
    $queryRaw: mockQueryRaw
  }
}));

jest.mock('@/lib/cache/trends-cache', () => ({
  trendsCache: {
    generateTrendsKey: jest.fn((params) => `test-key-${params.days}-${params.tag || 'all'}`),
    getOrSet: jest.fn(async (_key, fetcher) => fetcher()),
    getStats: jest.fn(() => ({ hits: 0, misses: 0, sets: 0 }))
  }
}));

import { prisma } from '@/lib/database';
import { trendsCache } from '@/lib/cache/trends-cache';

describe('/api/trends/analysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses
    mockQueryRaw.mockResolvedValue([]);
  });

  describe('days parameter validation', () => {
    it('should return 400 for invalid days parameter', async () => {
      const request = createMockRequest('http://localhost:3000/api/trends/analysis?days=invalid');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid days parameter: "invalid"');
      expect(trendsCache.getOrSet).not.toHaveBeenCalled();
    });

    it('should return 400 for negative days', async () => {
      const request = createMockRequest('http://localhost:3000/api/trends/analysis?days=-5');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('days must be at least 1');
      expect(trendsCache.getOrSet).not.toHaveBeenCalled();
    });

    it('should return 400 for days exceeding maximum', async () => {
      const request = createMockRequest('http://localhost:3000/api/trends/analysis?days=366');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('days must be at most 365');
      expect(trendsCache.getOrSet).not.toHaveBeenCalled();
    });

    it('should return 400 for zero days', async () => {
      const request = createMockRequest('http://localhost:3000/api/trends/analysis?days=0');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('days must be at least 1');
      expect(trendsCache.getOrSet).not.toHaveBeenCalled();
    });

    it('should return 400 for non-numeric string', async () => {
      const request = createMockRequest('http://localhost:3000/api/trends/analysis?days=abc');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid days parameter');
      expect(trendsCache.getOrSet).not.toHaveBeenCalled();
    });

    it('should return 400 for NaN string', async () => {
      const request = createMockRequest('http://localhost:3000/api/trends/analysis?days=NaN');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid days parameter');
      expect(trendsCache.getOrSet).not.toHaveBeenCalled();
    });
  });

  describe('valid requests', () => {
    it('should accept valid days parameter', async () => {
      const _mockData = {
        topTags: [],
        timeline: [],
        period: {
          from: new Date().toISOString(),
          to: new Date().toISOString(),
          days: 30
        }
      };

      (trendsCache.getOrSet as jest.Mock).mockImplementation(async (_key, fetcher) => {
        return fetcher();
      });

      const request = createMockRequest('http://localhost:3000/api/trends/analysis?days=30');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.error).toBeUndefined();
      expect(trendsCache.generateTrendsKey).toHaveBeenCalledWith({ days: 30, tag: undefined });
      expect(trendsCache.getOrSet).toHaveBeenCalled();
    });

    it('should use default value when days parameter is not provided', async () => {
      (trendsCache.getOrSet as jest.Mock).mockImplementation(async (_key, fetcher) => {
        return fetcher();
      });

      const request = createMockRequest('http://localhost:3000/api/trends/analysis');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.error).toBeUndefined();
      expect(trendsCache.generateTrendsKey).toHaveBeenCalledWith({ days: 30, tag: undefined });
    });

    it('should accept days at minimum boundary (1)', async () => {
      (trendsCache.getOrSet as jest.Mock).mockImplementation(async (_key, fetcher) => {
        return fetcher();
      });

      const request = createMockRequest('http://localhost:3000/api/trends/analysis?days=1');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.error).toBeUndefined();
      expect(trendsCache.generateTrendsKey).toHaveBeenCalledWith({ days: 1, tag: undefined });
    });

    it('should accept days at maximum boundary (365)', async () => {
      (trendsCache.getOrSet as jest.Mock).mockImplementation(async (_key, fetcher) => {
        return fetcher();
      });

      const request = createMockRequest('http://localhost:3000/api/trends/analysis?days=365');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.error).toBeUndefined();
      expect(trendsCache.generateTrendsKey).toHaveBeenCalledWith({ days: 365, tag: undefined });
    });

    it('should work with tag parameter', async () => {
      (trendsCache.getOrSet as jest.Mock).mockImplementation(async (_key, fetcher) => {
        return fetcher();
      });

      const request = createMockRequest('http://localhost:3000/api/trends/analysis?days=7&tag=javascript');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.error).toBeUndefined();
      expect(trendsCache.generateTrendsKey).toHaveBeenCalledWith({ days: 7, tag: 'javascript' });
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      (trendsCache.getOrSet as jest.Mock).mockImplementation(async (_key, _fetcher) => {
        throw new Error('Database connection failed');
      });

      const request = createMockRequest('http://localhost:3000/api/trends/analysis?days=30');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch trend analysis');
    });
  });

  describe('caching behavior', () => {
    it('should set appropriate cache headers', async () => {
      (trendsCache.getOrSet as jest.Mock).mockImplementation(async (_key, fetcher) => {
        return fetcher();
      });

      const request = createMockRequest('http://localhost:3000/api/trends/analysis?days=30');
      const response = await GET(request);

      expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=300, stale-while-revalidate=600');
    });

    it('should include cache stats in response', async () => {
      const mockStats = { hits: 5, misses: 2, sets: 7 };
      (trendsCache.getStats as jest.Mock).mockReturnValue(mockStats);
      (trendsCache.getOrSet as jest.Mock).mockImplementation(async (_key, fetcher) => {
        return fetcher();
      });

      const request = createMockRequest('http://localhost:3000/api/trends/analysis?days=30');
      const response = await GET(request);
      const data = await response.json();

      expect(data.cache).toBeDefined();
      expect(data.cache.stats).toEqual(mockStats);
    });
  });
});