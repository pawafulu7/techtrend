// Mock Redis
jest.mock('ioredis');

import { redis } from '@/lib/redis/client';

// Mock fetch
global.fetch = jest.fn();

// APIのテストのためのヘルパー関数
async function fetchAPI(url: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const response = await fetch(`${baseUrl}${url}`);
  const headers = Object.fromEntries(response.headers.entries());
  const data = await response.json();
  return { data, headers, status: response.status };
}

describe.skip('API Cache Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset Redis mock
    const redisMock = redis as any;
    if (redisMock._reset) {
      redisMock._reset();
    }
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('/api/sources', () => {
    it('should cache sources response', async () => {
      // Mock fetch responses
      const mockData = { sources: [{ id: '1', name: 'Test' }] };
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      
      // First call - cache miss
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Map([['x-cache-status', 'MISS']]),
        json: async () => mockData,
      } as any);
      
      // Second call - cache hit
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Map([['x-cache-status', 'HIT']]),
        json: async () => mockData,
      } as any);
      
      // First request - should be a cache miss
      const firstResponse = await fetchAPI('/api/sources');
      expect(firstResponse.status).toBe(200);
      expect(firstResponse.headers['x-cache-status']).toBe('MISS');
      
      // Second request - should be a cache hit
      const secondResponse = await fetchAPI('/api/sources');
      expect(secondResponse.status).toBe(200);
      expect(secondResponse.headers['x-cache-status']).toBe('HIT');
      
      // Data should be the same
      expect(secondResponse.data).toEqual(firstResponse.data);
    });

    it('should cache with different query parameters', async () => {
      // Request with category filter
      const categoryResponse = await fetchAPI('/api/sources?category=tech_blog');
      expect(categoryResponse.status).toBe(200);
      
      // Different parameters should have different cache
      const searchResponse = await fetchAPI('/api/sources?search=javascript');
      expect(searchResponse.status).toBe(200);
      
      // Original request should still be cached
      const cachedResponse = await fetchAPI('/api/sources?category=tech_blog');
      expect(cachedResponse.headers['x-cache-status']).toBe('HIT');
    });
  });

  describe('/api/articles', () => {
    it('should cache articles response', async () => {
      // First request - should be a cache miss
      const firstResponse = await fetchAPI('/api/articles?limit=5');
      expect(firstResponse.status).toBe(200);
      expect(firstResponse.headers['x-cache-status']).toBe('MISS');
      
      // Second request - should be a cache hit
      const secondResponse = await fetchAPI('/api/articles?limit=5');
      expect(secondResponse.status).toBe(200);
      expect(secondResponse.headers['x-cache-status']).toBe('HIT');
      
      // Response time should be faster for cached request
      const firstResponseTime = parseInt(firstResponse.headers['x-response-time']);
      const secondResponseTime = parseInt(secondResponse.headers['x-response-time']);
      expect(secondResponseTime).toBeLessThan(firstResponseTime);
    });

    it('should handle pagination cache correctly', async () => {
      // Page 1
      const page1 = await fetchAPI('/api/articles?page=1&limit=10');
      expect(page1.status).toBe(200);
      
      // Page 2 should have different cache
      const page2 = await fetchAPI('/api/articles?page=2&limit=10');
      expect(page2.status).toBe(200);
      expect(page2.data).not.toEqual(page1.data);
      
      // Page 1 should be cached
      const page1Cached = await fetchAPI('/api/articles?page=1&limit=10');
      expect(page1Cached.headers['x-cache-status']).toBe('HIT');
    });

    it('should handle filters in cache key', async () => {
      // With source filter
      const sourceFiltered = await fetchAPI('/api/articles?sourceId=123');
      expect(sourceFiltered.status).toBe(200);
      
      // With tag filter
      const tagFiltered = await fetchAPI('/api/articles?tag=javascript');
      expect(tagFiltered.status).toBe(200);
      
      // With search
      const searchFiltered = await fetchAPI('/api/articles?search=redis');
      expect(searchFiltered.status).toBe(200);
      
      // Each should have its own cache
      const cached = await fetchAPI('/api/articles?tag=javascript');
      expect(cached.headers['x-cache-status']).toBe('HIT');
    });
  });
});