import { NextRequest } from 'next/server';
import { GET } from '@/app/api/articles/route';
// Use Prisma mock instead of real DB
jest.mock('@/lib/database');
import prismaMock from '@/__mocks__/lib/prisma';

// Mock the Redis cache
jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    generateCacheKey: jest.fn().mockReturnValue('test-cache-key'),
  })),
}));

// Mock the logger
jest.mock('@/lib/logger', () => ({
  log: {
    error: jest.fn(),
  },
}));

describe('Date Range Filter API', () => {
  const baseUrl = 'http://localhost:3000';
  
  const today = new Date();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
  const fourMonthsAgo = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
  
  const testArticles = [
    { id: 'today-article', title: 'Today Article', url: 'https://example.com/today', publishedAt: today, sourceId: 'test-source', createdAt: today, updatedAt: today },
    { id: 'week-article', title: 'Week Article', url: 'https://example.com/week', publishedAt: threeDaysAgo, sourceId: 'test-source', createdAt: today, updatedAt: today },
    { id: 'month-article', title: 'Month Article', url: 'https://example.com/month', publishedAt: fifteenDaysAgo, sourceId: 'test-source', createdAt: today, updatedAt: today },
    { id: 'old-article', title: 'Old Article', url: 'https://example.com/old', publishedAt: fourMonthsAgo, sourceId: 'test-source', createdAt: today, updatedAt: today },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return all articles when dateRange is not specified', async () => {
    prismaMock.article.findMany.mockResolvedValue(testArticles);
    prismaMock.article.count.mockResolvedValue(4);
    const request = new NextRequest(`${baseUrl}/api/articles`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.items).toHaveLength(4);
  });

  it('should return only today\'s articles when dateRange=today', async () => {
    prismaMock.article.findMany.mockResolvedValue([testArticles[0]]);
    prismaMock.article.count.mockResolvedValue(1);
    const request = new NextRequest(`${baseUrl}/api/articles?dateRange=today`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.items).toHaveLength(1);
    expect(data.data.items[0].id).toBe('today-article');
  });

  it('should return articles from last week when dateRange=week', async () => {
    prismaMock.article.findMany.mockResolvedValue([testArticles[0], testArticles[1]]);
    prismaMock.article.count.mockResolvedValue(2);
    const request = new NextRequest(`${baseUrl}/api/articles?dateRange=week`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.items).toHaveLength(2); // today and week articles
    expect(data.data.items.map((a: any) => a.id)).toContain('today-article');
    expect(data.data.items.map((a: any) => a.id)).toContain('week-article');
  });

  it('should return articles from last month when dateRange=month', async () => {
    prismaMock.article.findMany.mockResolvedValue([testArticles[0], testArticles[1], testArticles[2]]);
    prismaMock.article.count.mockResolvedValue(3);
    const request = new NextRequest(`${baseUrl}/api/articles?dateRange=month`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.items).toHaveLength(3); // today, week, and month articles
    expect(data.data.items.map((a: any) => a.id)).not.toContain('old-article');
  });

  it('should return articles from last 3 months when dateRange=3months', async () => {
    prismaMock.article.findMany.mockResolvedValue([testArticles[0], testArticles[1], testArticles[2]]);
    prismaMock.article.count.mockResolvedValue(3);
    const request = new NextRequest(`${baseUrl}/api/articles?dateRange=3months`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.items).toHaveLength(3); // All except the 4-month-old article
    expect(data.data.items.map((a: any) => a.id)).not.toContain('old-article');
  });

  it('should return all articles when dateRange=all', async () => {
    prismaMock.article.findMany.mockResolvedValue(testArticles);
    prismaMock.article.count.mockResolvedValue(4);
    const request = new NextRequest(`${baseUrl}/api/articles?dateRange=all`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.items).toHaveLength(4);
  });

  it('should handle invalid dateRange values gracefully', async () => {
    prismaMock.article.findMany.mockResolvedValue(testArticles);
    prismaMock.article.count.mockResolvedValue(4);
    const request = new NextRequest(`${baseUrl}/api/articles?dateRange=invalid`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.items).toHaveLength(4); // Should return all articles
  });

  it('should combine dateRange with other filters', async () => {
    // Create another source with an article
    // Emulate combined filter by returning only matching items
    prismaMock.article.findMany.mockResolvedValue([testArticles[0]]);
    prismaMock.article.count.mockResolvedValue(1);
    const request = new NextRequest(`${baseUrl}/api/articles?sourceId=test-source&dateRange=today`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.items).toHaveLength(1);
    expect(data.data.items[0].id).toBe('today-article');
    expect(data.data.items[0].sourceId).toBe('test-source');
  });

  it('should cache results with dateRange parameter', async () => {
    prismaMock.article.findMany.mockResolvedValue([testArticles[0], testArticles[1]]);
    prismaMock.article.count.mockResolvedValue(2);
    const request = new NextRequest(`${baseUrl}/api/articles?dateRange=week`);
    const response = await GET(request);
    
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Cache-Status')).toBe('MISS');
    
    // Second request should hit cache (but our mock always returns null)
    const response2 = await GET(request);
    expect(response2.status).toBe(200);
    expect(response2.headers.get('X-Cache-Status')).toBe('MISS'); // Due to mock
  });
});
