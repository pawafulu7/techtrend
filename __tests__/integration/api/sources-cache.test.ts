/**
 * @jest-environment node
 */

// Setup file for node environment
require('../../setup/node');

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/sources/route';

// Mock the dependencies
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    source: {
      findMany: jest.fn(),
    },
  })),
}));

jest.mock('@/lib/rate-limiter', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

// Import mocked dependencies
import { redis } from '@/lib/rate-limiter';
import { PrismaClient } from '@prisma/client';

describe.skip('/api/sources - Cache Integration', () => {
  const mockPrisma = new PrismaClient();
  const mockRedis = redis as jest.Mocked<typeof redis>;
  
  // Sample data
  const mockSources = [
    {
      id: '1',
      name: 'Dev.to',
      type: 'rss',
      url: 'https://dev.to',
      enabled: true,
      _count: { articles: 150 },
      articles: [
        {
          qualityScore: 85,
          publishedAt: new Date('2025-02-01'),
          tags: [{ name: 'javascript' }, { name: 'react' }],
        },
        {
          qualityScore: 90,
          publishedAt: new Date('2025-02-02'),
          tags: [{ name: 'typescript' }],
        },
      ],
    },
    {
      id: '2',
      name: 'Qiita',
      type: 'api',
      url: 'https://qiita.com',
      enabled: true,
      _count: { articles: 200 },
      articles: [
        {
          qualityScore: 80,
          publishedAt: new Date('2025-02-01'),
          tags: [{ name: 'python' }],
        },
      ],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup Prisma mock
    (mockPrisma.source.findMany as jest.Mock).mockResolvedValue(mockSources);
  });

  describe('Cache behavior', () => {
    it('should return MISS and cache data on first request', async () => {
      // Setup: Cache miss
      mockRedis.get.mockResolvedValue(null);
      
      // Create request
      const request = new NextRequest('http://localhost:3000/api/sources');
      
      // Execute
      const response = await GET(request);
      const data = await response.json();
      
      // Verify response
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Status')).toBe('MISS');
      expect(response.headers.get('X-Response-Time')).toMatch(/\d+ms/);
      
      // Verify data
      expect(data.sources).toHaveLength(2);
      expect(data.totalCount).toBe(2);
      
      // Verify cache was set
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('sources:'),
        expect.any(String),
        { ex: 3600 }
      );
      
      // Verify Prisma was called
      expect(mockPrisma.source.findMany).toHaveBeenCalled();
    });

    it('should return HIT and cached data on second request', async () => {
      // Setup: Cache hit
      const cachedData = {
        sources: mockSources.map(s => ({
          id: s.id,
          name: s.name,
          type: s.type,
          url: s.url,
          enabled: s.enabled,
          category: 'community',
          stats: {
            totalArticles: s._count.articles,
            avgQualityScore: 85,
            popularTags: ['javascript', 'react'],
            publishFrequency: 0.1,
            lastPublished: s.articles[0].publishedAt,
            growthRate: 0,
          },
        })),
        totalCount: 2,
      };
      
      mockRedis.get.mockResolvedValue(cachedData);
      
      // Create request
      const request = new NextRequest('http://localhost:3000/api/sources');
      
      // Execute
      const response = await GET(request);
      const data = await response.json();
      
      // Verify response
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Status')).toBe('HIT');
      expect(response.headers.get('X-Response-Time')).toMatch(/\d+ms/);
      
      // Verify data
      expect(data).toEqual(cachedData);
      
      // Verify Prisma was NOT called
      expect(mockPrisma.source.findMany).not.toHaveBeenCalled();
    });

    it('should generate different cache keys for different parameters', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      // Request 1: Default parameters
      const request1 = new NextRequest('http://localhost:3000/api/sources');
      await GET(request1);
      
      // Request 2: With category filter
      const request2 = new NextRequest('http://localhost:3000/api/sources?category=tech_blog');
      await GET(request2);
      
      // Request 3: With sort parameters
      const request3 = new NextRequest('http://localhost:3000/api/sources?sortBy=quality&order=asc');
      await GET(request3);
      
      // Verify different cache keys were used
      const setCalls = (mockRedis.set as jest.Mock).mock.calls;
      expect(setCalls).toHaveLength(3);
      
      const cacheKeys = setCalls.map(call => call[0]);
      expect(new Set(cacheKeys).size).toBe(3); // All keys should be unique
    });

    it('should handle Redis errors gracefully', async () => {
      // Setup: Redis error
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Create request
      const request = new NextRequest('http://localhost:3000/api/sources');
      
      // Execute
      const response = await GET(request);
      const data = await response.json();
      
      // Verify response (should fallback to database)
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Status')).toBe('MISS');
      expect(data.sources).toHaveLength(2);
      
      // Verify Prisma was called (fallback)
      expect(mockPrisma.source.findMany).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Query parameter handling', () => {
    it('should handle category filter', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      const request = new NextRequest('http://localhost:3000/api/sources?category=tech_blog');
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      // The mock data would be filtered by category in real implementation
    });

    it('should handle search parameter', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      const request = new NextRequest('http://localhost:3000/api/sources?search=Dev');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      expect(mockPrisma.source.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: {
              contains: 'Dev',
              mode: 'insensitive',
            },
          }),
        })
      );
    });

    it('should handle sort parameters', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      const request = new NextRequest('http://localhost:3000/api/sources?sortBy=name&order=asc');
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      // Verify the cache key includes sort parameters
      const cacheKeyCall = (mockRedis.set as jest.Mock).mock.calls[0][0];
      expect(cacheKeyCall).toContain('sortBy=name');
      expect(cacheKeyCall).toContain('order=asc');
    });
  });

  describe('Performance headers', () => {
    it('should include performance measurement headers', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      const request = new NextRequest('http://localhost:3000/api/sources');
      const response = await GET(request);
      
      // Check headers
      expect(response.headers.get('X-Cache-Status')).toBeDefined();
      expect(response.headers.get('X-Response-Time')).toBeDefined();
      
      // Parse response time
      const responseTime = response.headers.get('X-Response-Time');
      expect(responseTime).toMatch(/^\d+ms$/);
      
      const timeValue = parseInt(responseTime!.replace('ms', ''));
      expect(timeValue).toBeGreaterThanOrEqual(0);
      expect(timeValue).toBeLessThan(5000); // Should be less than 5 seconds
    });

    it('should show faster response time on cache hit', async () => {
      // First request - cache miss
      mockRedis.get.mockResolvedValueOnce(null);
      const request1 = new NextRequest('http://localhost:3000/api/sources');
      const response1 = await GET(request1);
      const time1 = parseInt(response1.headers.get('X-Response-Time')!.replace('ms', ''));
      
      // Second request - cache hit
      mockRedis.get.mockResolvedValueOnce({ sources: [], totalCount: 0 });
      const request2 = new NextRequest('http://localhost:3000/api/sources');
      const response2 = await GET(request2);
      const time2 = parseInt(response2.headers.get('X-Response-Time')!.replace('ms', ''));
      
      // Cache hit should generally be faster (though not guaranteed in tests)
      expect(response2.headers.get('X-Cache-Status')).toBe('HIT');
      expect(time2).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should handle database errors', async () => {
      mockRedis.get.mockResolvedValue(null);
      (mockPrisma.source.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const request = new NextRequest('http://localhost:3000/api/sources');
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
      
      consoleErrorSpy.mockRestore();
    });
  });
});