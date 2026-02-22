/**
 * /api/trends/heatmap エンドポイントのテスト
 */

jest.mock('@/lib/cache/trends-cache', () => ({
  trendsCache: {
    getOrSet: jest.fn((_key: string, fn: () => Promise<unknown>) => fn()),
  },
}));

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_key: string, handler: Function) => handler),
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import { GET } from '@/app/api/trends/heatmap/route';
import { prisma } from '@/lib/database';
import { NextRequest } from 'next/server';

const prismaMock = prisma as any;

function createRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/trends/heatmap');
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return new NextRequest(url);
}

describe('/api/trends/heatmap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns category data with share-based change rates (200)', async () => {
    // current: ai_ml=60, frontend=40 → total=100, shares: 60%, 40%
    // previous: ai_ml=50, frontend=50 → total=100, shares: 50%, 50%
    const currentData = [
      { category: 'ai_ml', count: BigInt(60) },
      { category: 'frontend', count: BigInt(40) },
    ];
    const previousData = [
      { category: 'ai_ml', count: BigInt(50) },
      { category: 'frontend', count: BigInt(50) },
    ];

    prismaMock.$queryRaw
      .mockResolvedValueOnce(currentData)
      .mockResolvedValueOnce(previousData);

    const response = await GET(createRequest({ period: 'week' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.period).toBe('week');
    expect(data.categories).toHaveLength(2);

    // ai_ml: share 60% (was 50%) → changeRate = +10.0
    const aiCategory = data.categories.find(
      (c: any) => c.category === 'ai_ml'
    );
    expect(aiCategory).toBeDefined();
    expect(aiCategory.count).toBe(60);
    expect(aiCategory.share).toBe(60);
    expect(aiCategory.changeRate).toBe(10);

    // frontend: share 40% (was 50%) → changeRate = -10.0
    const feCategory = data.categories.find(
      (c: any) => c.category === 'frontend'
    );
    expect(feCategory).toBeDefined();
    expect(feCategory.count).toBe(40);
    expect(feCategory.share).toBe(40);
    expect(feCategory.changeRate).toBe(-10);

    // sorted by count desc
    expect(data.categories[0].category).toBe('ai_ml');
    expect(data.categories[1].category).toBe('frontend');

    // Cache-Control header
    expect(response.headers.get('Cache-Control')).toBe(
      'public, s-maxage=300, stale-while-revalidate=600'
    );
  });

  it('validates invalid period parameter (400)', async () => {
    const response = await GET(createRequest({ period: 'year' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Invalid period parameter');
    expect(data.error).not.toContain('year');
  });

  it('defaults to week period', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ category: 'ai_ml', count: BigInt(10) }])
      .mockResolvedValueOnce([]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.period).toBe('week');
  });

  it('excludes null category articles', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        { category: 'ai_ml', count: BigInt(10) },
        { category: null, count: BigInt(15) },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.categories).toHaveLength(1);
    expect(data.categories[0].category).toBe('ai_ml');
    expect(data.categories[0].share).toBe(100);
  });

  it('returns 500 when database query fails', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('DB error'));
    const response = await GET(createRequest());
    const data = await response.json();
    expect(response.status).toBe(500);
    expect(data.error).toBeDefined();
  });

  it('includes generatedAt field in response', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ category: 'ai_ml', count: BigInt(10) }])
      .mockResolvedValueOnce([]);
    const response = await GET(createRequest());
    const data = await response.json();
    expect(data.generatedAt).toBeDefined();
    expect(new Date(data.generatedAt).getTime()).not.toBeNaN();
  });

  it('filters out categories with 0 articles', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        { category: 'ai_ml', count: BigInt(10) },
        { category: 'backend', count: BigInt(0) },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(data.categories).toHaveLength(1);
    expect(data.categories[0].category).toBe('ai_ml');
  });
});
