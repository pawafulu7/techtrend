/**
 * /api/ai/diff-summary GET endpoint fallback logic tests
 *
 * Tests the behavior when the requested week has no data and the API
 * falls back to the latest available week's data.
 *
 * Prisma mock call order (normal case):
 *   1. diffSummary.findMany - query for requested week
 *
 * Prisma mock call order (fallback case):
 *   1. diffSummary.findMany - query for requested week (returns [])
 *   2. diffSummary.findFirst - find latest available week
 *   3. diffSummary.findMany - query for latest week's data
 */

const mockCacheSet = jest.fn().mockResolvedValue(undefined);
const mockCacheGet = jest.fn().mockResolvedValue(null);
const mockCacheDel = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    get: mockCacheGet,
    set: mockCacheSet,
    del: mockCacheDel,
  })),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    diffSummary: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('@/lib/constants/source-categories', () => ({
  SOURCE_CATEGORIES: {
    frontend: { id: 'frontend', name: 'フロントエンド', description: 'Frontend', sourceIds: [] },
    ai_ml: { id: 'ai_ml', name: 'AI/ML', description: 'AI and ML', sourceIds: [] },
  },
}));

jest.mock('@/lib/ai/diff-summary', () => ({
  getDiffSummaryService: jest.fn(),
  getISOWeek: jest.fn().mockReturnValue('2026-W08'),
  getPreviousISOWeek: jest.fn((week: string) => {
    const match = week.match(/^(\d{4})-W(\d{2})$/);
    if (!match) return '2026-W07';
    const year = parseInt(match[1], 10);
    const num = parseInt(match[2], 10);
    if (num <= 1) return `${year - 1}-W52`;
    return `${year}-W${String(num - 1).padStart(2, '0')}`;
  }),
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

import { GET } from '@/app/api/ai/diff-summary/route';
import { prisma } from '@/lib/prisma';
import { RedisCache } from '@/lib/cache';
import { NextRequest } from 'next/server';

const prismaMock = prisma as any;

function createRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/ai/diff-summary');
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return new NextRequest(url);
}

// Helper to create a mock DiffSummary record
function createMockSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: 'summary-1',
    categorySlug: 'ai_ml',
    currentPeriod: '2026-W08',
    baselinePeriod: '2026-W07',
    changes: [
      {
        topic: 'LLM advances',
        type: 'emerging',
        detail: 'New model released',
      },
    ],
    unchanged: ['Transformer architecture remains dominant'],
    modelVersion: 'gemini-2.5-flash-lite',
    promptVersion: 'v1',
    status: 'SUCCESS',
    generatedAt: new Date('2026-02-20T10:00:00Z'),
    ...overrides,
  };
}

describe('/api/ai/diff-summary GET fallback logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns normal response when requested week has data (no fallback)', async () => {
    const mockSummary = createMockSummary();
    prismaMock.diffSummary.findMany.mockResolvedValueOnce([mockSummary]);

    const response = await GET(createRequest({ week: '2026-W08' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.week).toBe('2026-W08');
    expect(data.data).toHaveLength(1);
    expect(data.data[0].categorySlug).toBe('ai_ml');
    // No fallback fields
    expect(data.isFallback).toBeUndefined();
    expect(data.requestedWeek).toBeUndefined();
    // findFirst should NOT be called when data exists
    expect(prismaMock.diffSummary.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to latest week when requested week has no data (no category filter)', async () => {
    const latestSummary = createMockSummary({
      currentPeriod: '2026-W06',
      baselinePeriod: '2026-W05',
    });

    // 1st findMany: requested week returns empty
    prismaMock.diffSummary.findMany.mockResolvedValueOnce([]);
    // findFirst: find latest available week
    prismaMock.diffSummary.findFirst.mockResolvedValueOnce({
      currentPeriod: '2026-W06',
    });
    // 2nd findMany: latest week's data
    prismaMock.diffSummary.findMany.mockResolvedValueOnce([latestSummary]);

    const response = await GET(createRequest({ week: '2026-W08' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.week).toBe('2026-W06');
    expect(data.isFallback).toBe(true);
    expect(data.requestedWeek).toBe('2026-W08');
    expect(data.data).toHaveLength(1);
    expect(data.data[0].currentPeriod).toBe('2026-W06');
  });

  it('falls back to latest week for specific category when requested week has no data', async () => {
    const latestCategorySummary = createMockSummary({
      categorySlug: 'frontend',
      currentPeriod: '2026-W05',
      baselinePeriod: '2026-W04',
    });

    // 1st findMany: requested week + category returns empty
    prismaMock.diffSummary.findMany.mockResolvedValueOnce([]);
    // findFirst: find latest week with this category
    prismaMock.diffSummary.findFirst.mockResolvedValueOnce({
      currentPeriod: '2026-W05',
    });
    // 2nd findMany: latest week's data for this category
    prismaMock.diffSummary.findMany.mockResolvedValueOnce([
      latestCategorySummary,
    ]);

    const response = await GET(
      createRequest({ week: '2026-W08', category: 'frontend' })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.week).toBe('2026-W05');
    expect(data.isFallback).toBe(true);
    expect(data.requestedWeek).toBe('2026-W08');
    expect(data.data).toHaveLength(1);
    expect(data.data[0].categorySlug).toBe('frontend');

    // Verify findFirst was called with category filter
    expect(prismaMock.diffSummary.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categorySlug: 'frontend',
        }),
      })
    );
  });

  it('returns empty data array when no diff summaries exist at all (no fallback flags)', async () => {
    // 1st findMany: requested week returns empty
    prismaMock.diffSummary.findMany.mockResolvedValueOnce([]);
    // findFirst: no records exist at all
    prismaMock.diffSummary.findFirst.mockResolvedValueOnce(null);

    const response = await GET(createRequest({ week: '2026-W08' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.week).toBe('2026-W08');
    expect(data.data).toHaveLength(0);
    // No fallback flags when there's simply no data anywhere
    expect(data.isFallback).toBeUndefined();
    expect(data.requestedWeek).toBeUndefined();
    // findMany should only be called once (no second query since findFirst returned null)
    expect(prismaMock.diffSummary.findMany).toHaveBeenCalledTimes(1);
  });

  it('does not cache fallback responses to avoid cache pollution', async () => {
    const latestSummary = createMockSummary({
      currentPeriod: '2026-W06',
      baselinePeriod: '2026-W05',
    });

    // 1st findMany: requested week returns empty
    prismaMock.diffSummary.findMany.mockResolvedValueOnce([]);
    // findFirst: latest is W06
    prismaMock.diffSummary.findFirst.mockResolvedValueOnce({
      currentPeriod: '2026-W06',
    });
    // 2nd findMany: W06 data
    prismaMock.diffSummary.findMany.mockResolvedValueOnce([latestSummary]);

    const response = await GET(createRequest({ week: '2026-W08' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.isFallback).toBe(true);

    // Verify cache.set was NOT called for fallback responses
    expect(mockCacheSet).not.toHaveBeenCalled();

    // Verify fallback response uses shorter TTL
    expect(response.headers.get('X-Cache')).toBe('MISS');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');
  });
});
