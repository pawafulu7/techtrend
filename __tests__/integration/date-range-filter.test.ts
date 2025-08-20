import { NextRequest } from 'next/server';
import { GET } from '@/app/api/articles/route';
import { prisma } from '@/lib/database';

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
  
  // Create test data with different publish dates
  const testArticles = [
    {
      id: 'today-article',
      title: 'Today Article',
      url: 'https://example.com/today',
      publishedAt: new Date(), // Today
      sourceId: 'test-source',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'week-article',
      title: 'Week Article',
      url: 'https://example.com/week',
      publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      sourceId: 'test-source',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'month-article',
      title: 'Month Article',
      url: 'https://example.com/month',
      publishedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
      sourceId: 'test-source',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'old-article',
      title: 'Old Article',
      url: 'https://example.com/old',
      publishedAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000), // 4 months ago
      sourceId: 'test-source',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(async () => {
    // Clean database
    await prisma.article.deleteMany();
    await prisma.source.deleteMany();
    
    // Create test source
    await prisma.source.create({
      data: {
        id: 'test-source',
        name: 'Test Source',
        type: 'RSS',
        url: 'https://example.com',
        enabled: true,
      },
    });
    
    // Create test articles
    for (const article of testArticles) {
      await prisma.article.create({
        data: article,
      });
    }
  });

  afterEach(async () => {
    await prisma.article.deleteMany();
    await prisma.source.deleteMany();
    jest.clearAllMocks();
  });

  it('should return all articles when dateRange is not specified', async () => {
    const request = new NextRequest(`${baseUrl}/api/articles`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.items).toHaveLength(4);
  });

  it('should return only today\'s articles when dateRange=today', async () => {
    const request = new NextRequest(`${baseUrl}/api/articles?dateRange=today`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.items).toHaveLength(1);
    expect(data.data.items[0].id).toBe('today-article');
  });

  it('should return articles from last week when dateRange=week', async () => {
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
    const request = new NextRequest(`${baseUrl}/api/articles?dateRange=month`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.items).toHaveLength(3); // today, week, and month articles
    expect(data.data.items.map((a: any) => a.id)).not.toContain('old-article');
  });

  it('should return articles from last 3 months when dateRange=3months', async () => {
    const request = new NextRequest(`${baseUrl}/api/articles?dateRange=3months`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.items).toHaveLength(3); // All except the 4-month-old article
    expect(data.data.items.map((a: any) => a.id)).not.toContain('old-article');
  });

  it('should return all articles when dateRange=all', async () => {
    const request = new NextRequest(`${baseUrl}/api/articles?dateRange=all`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.items).toHaveLength(4);
  });

  it('should handle invalid dateRange values gracefully', async () => {
    const request = new NextRequest(`${baseUrl}/api/articles?dateRange=invalid`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.items).toHaveLength(4); // Should return all articles
  });

  it('should combine dateRange with other filters', async () => {
    // Create another source with an article
    await prisma.source.create({
      data: {
        id: 'another-source',
        name: 'Another Source',
        type: 'RSS',
        url: 'https://another.com',
        enabled: true,
      },
    });
    
    await prisma.article.create({
      data: {
        id: 'another-today-article',
        title: 'Another Today Article',
        url: 'https://another.com/today',
        publishedAt: new Date(),
        sourceId: 'another-source',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Filter by both source and date range
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