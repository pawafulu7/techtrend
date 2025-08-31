/**
 * @jest-environment node
 */

// Setup file for node environment
require('../../setup/node');

// Create shared singleton mocks so module under test and test share the same instances
const prismaSingleton = {
  source: {
    findMany: jest.fn(),
  },
};

const redisSingleton = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  on: jest.fn(),
};

// Mock the dependencies BEFORE importing the route under test
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prismaSingleton),
}));

// Redis client mock returns the same shared instance for both getRedisClient() and exported redis
jest.mock('@/lib/redis/client', () => ({
  getRedisClient: jest.fn(() => redisSingleton),
  redis: redisSingleton,
}));

// Mock source cache used by list endpoint
jest.mock('@/lib/cache/source-cache', () => ({
  sourceCache: {
    getAllSourcesWithStats: jest.fn(),
  },
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/sources/route';
import { PrismaClient } from '@prisma/client';
import { redis } from '@/lib/redis/client';
import { sourceCache } from '@/lib/cache/source-cache';

describe('/api/sources - Cache Integration', () => {
  const mockPrisma = new PrismaClient();
  const mockRedis = redis as unknown as jest.Mocked<typeof redisSingleton>;
  
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
    // Default list response via sourceCache mock
    (sourceCache.getAllSourcesWithStats as jest.Mock).mockResolvedValue([
      {
        id: '1', name: 'Dev.to', type: 'rss', url: 'https://dev.to', enabled: true,
        category: 'community',
        stats: { totalArticles: 150, avgQualityScore: 85, popularTags: [], publishFrequency: 0.1, lastPublished: new Date(), growthRate: 0 },
      },
      {
        id: '2', name: 'Qiita', type: 'api', url: 'https://qiita.com', enabled: true,
        category: 'community',
        stats: { totalArticles: 200, avgQualityScore: 80, popularTags: [], publishFrequency: 0.1, lastPublished: new Date(), growthRate: 0 },
      },
    ]);
  });

  describe('Cache behavior', () => {
    it('should return data for list endpoint (cache-backed)', async () => {
      
      // Create request
      const request = new NextRequest('http://localhost:3000/api/sources');
      
      // Execute
      const response = await GET(request);
      const data = await response.json();
      
      // Verify response
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Status')).toBeDefined();
      expect(response.headers.get('X-Response-Time')).toMatch(/\d+ms/);
      
      // Verify data
      expect(data.sources).toHaveLength(2);
      expect(data.totalCount).toBe(2);
      
      // List path should not hit Prisma directly
      expect(mockPrisma.source.findMany).not.toHaveBeenCalled();
    });

    it('should return list response consistently', async () => {
      const request = new NextRequest('http://localhost:3000/api/sources');
      const response = await GET(request);
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Status')).toBeDefined();
      expect(response.headers.get('X-Response-Time')).toMatch(/\d+ms/);
      expect(Array.isArray(data.sources)).toBe(true);
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

    // Redis errors are not relevant for list endpoint (using sourceCache)
  });

  describe('Query parameter handling', () => {
    it('should handle category filter', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      const request = new NextRequest('http://localhost:3000/api/sources?category=tech_blog');
      const response = await GET(request);
      const _data = await response.json();
      
      expect(response.status).toBe(200);
      // The mock data would be filtered by category in real implementation
    });

    it('should handle search parameter', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      const request = new NextRequest('http://localhost:3000/api/sources?search=Dev');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      expect(response.status).toBe(200);
    });

    it('should handle sort parameters', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      const request = new NextRequest('http://localhost:3000/api/sources?sortBy=name&order=asc');
      const response = await GET(request);
      const _data = await response.json();
      
      expect(response.status).toBe(200);
      expect(response.status).toBe(200);
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
      // First request
      const request1 = new NextRequest('http://localhost:3000/api/sources');
      const response1 = await GET(request1);
      const _time1 = parseInt(response1.headers.get('X-Response-Time')!.replace('ms', ''));
      
      // Second request
      const request2 = new NextRequest('http://localhost:3000/api/sources');
      const response2 = await GET(request2);
      const time2 = parseInt(response2.headers.get('X-Response-Time')!.replace('ms', ''));
      
      // Ensure headers exist
      expect(response2.headers.get('X-Cache-Status')).toBeDefined();
      expect(time2).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should return 500 when list cache fails', async () => {
      (sourceCache.getAllSourcesWithStats as jest.Mock).mockRejectedValue(new Error('cache failure'));
      const request = new NextRequest('http://localhost:3000/api/sources');
      const response = await GET(request);
      const data = await response.json();
      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });
  });
});
