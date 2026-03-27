/**
 * /api/trends/daily エンドポイントのフォールバックロジックテスト
 */

// --- Mocks (must be before imports) ---

const mockGetTrendReport = jest.fn();
const mockGetLatestReport = jest.fn();
const mockGetAdjacentReportDates = jest.fn();

jest.mock('@/lib/services/trend-report/trend-report-generator', () => ({
  TrendReportGenerator: jest.fn().mockImplementation(() => ({
    getTrendReport: mockGetTrendReport,
    getLatestReport: mockGetLatestReport,
    getAdjacentReportDates: mockGetAdjacentReportDates,
  })),
}));

const mockCacheSet = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null), // always cache MISS
    set: mockCacheSet,
    generateCacheKey: jest.fn(
      (prefix: string, opts: { params: { date: string } }) =>
        `${prefix}:${opts.params.date}`
    ),
  })),
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

jest.mock('@/lib/middleware/with-cron-or-admin-auth', () => ({
  withCronOrAdminAuth: jest.fn((handler: Function) => handler),
}));

import { GET } from '@/app/api/trends/daily/route';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { TrendPeriodType } from '@prisma/client';

// --- Helpers ---

function createRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/trends/daily');
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return new NextRequest(url);
}

/**
 * Create a mock TrendReportData object.
 * periodStart is interpreted as JST midnight -> converted to UTC (i.e. -9h).
 */
function createMockReport(dateStr: string) {
  // dateStr: "YYYY-MM-DD" in JST
  const periodStart = new Date(dateStr + 'T00:00:00+09:00');
  const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
  return {
    id: `report-${dateStr}`,
    periodType: TrendPeriodType.DAILY,
    periodStart,
    periodEnd,
    generatedAt: new Date('2026-02-20T03:00:00Z'),
    totalArticles: 42,
    trendingKeywords: [
      { keyword: 'AI', count: 10, growth: 5.0 },
      { keyword: 'React', count: 8, growth: 2.0 },
    ],
    topArticles: [],
    categoryBreakdown: [],
  };
}

// --- Tests ---

describe('/api/trends/daily - fallback logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns normal response when requested date has data (no isFallback)', async () => {
    const report = createMockReport('2026-02-20');

    mockGetTrendReport.mockResolvedValueOnce(report);
    mockGetAdjacentReportDates.mockResolvedValueOnce({
      prevDate: new Date('2026-02-19T00:00:00+09:00'),
      nextDate: null,
    });

    const response = await GET(createRequest({ date: '2026-02-20' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.isFallback).toBeUndefined();
    expect(data.data).toBeDefined();
    expect(data.data.id).toBe('report-2026-02-20');
    expect(data.data.periodStart).toBe(report.periodStart.toISOString());
    expect(data.navigation).toBeDefined();
    expect(data.navigation.prevDate).toBe('2026-02-19');
    expect(data.navigation.nextDate).toBeNull();

    // Cache header
    expect(response.headers.get('X-Cache')).toBe('MISS');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');

    // Verify cache.set WAS called for normal (non-fallback) responses
    expect(mockCacheSet).toHaveBeenCalledTimes(1);
  });

  it('returns fallback response when requested date has no data but latest report exists', async () => {
    const latestReport = createMockReport('2026-02-18');

    // Requested date (2026-02-20) has no report
    mockGetTrendReport.mockResolvedValueOnce(null);
    // Latest report is for 2026-02-18
    mockGetLatestReport.mockResolvedValueOnce(latestReport);
    // Adjacent dates for the fallback date
    mockGetAdjacentReportDates.mockResolvedValueOnce({
      prevDate: new Date('2026-02-17T00:00:00+09:00'),
      nextDate: null,
    });

    const response = await GET(createRequest({ date: '2026-02-20' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.isFallback).toBe(true);
    expect(data.requestedDate).toBe('2026-02-20');
    expect(data.actualDate).toBe('2026-02-18');
    expect(data.data).toBeDefined();
    expect(data.data.id).toBe('report-2026-02-18');
    expect(data.data.periodStart).toBe(latestReport.periodStart.toISOString());
    expect(data.data.periodEnd).toBe(latestReport.periodEnd.toISOString());
    expect(data.data.generatedAt).toBe(
      latestReport.generatedAt.toISOString()
    );

    // Fallback uses shorter Cache-Control TTL
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');

    // Verify cache.set was NOT called for fallback responses
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it('returns 404 when no reports exist at all', async () => {
    mockGetTrendReport.mockResolvedValueOnce(null);
    mockGetLatestReport.mockResolvedValueOnce(null);

    const response = await GET(createRequest({ date: '2026-02-20' }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('No report found for this date');
    expect(data.requestedDate).toBe('2026-02-20');
    expect(data.latestAvailableDate).toBeNull();

    // getAdjacentReportDates should not be called when no report exists
    expect(mockGetAdjacentReportDates).not.toHaveBeenCalled();
  });

  it('returns navigation based on fallback (actual) date, not requested date', async () => {
    const latestReport = createMockReport('2026-02-15');

    mockGetTrendReport.mockResolvedValueOnce(null);
    mockGetLatestReport.mockResolvedValueOnce(latestReport);
    // Navigation around 2026-02-15 (the actual/fallback date)
    mockGetAdjacentReportDates.mockResolvedValueOnce({
      prevDate: new Date('2026-02-14T00:00:00+09:00'),
      nextDate: new Date('2026-02-16T00:00:00+09:00'),
    });

    const response = await GET(createRequest({ date: '2026-02-20' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.isFallback).toBe(true);
    expect(data.actualDate).toBe('2026-02-15');

    // Navigation should correspond to 2026-02-15's neighbors, not 2026-02-20's
    expect(data.navigation.prevDate).toBe('2026-02-14');
    expect(data.navigation.nextDate).toBe('2026-02-16');

    // Verify getAdjacentReportDates was called with the fallback report's periodStart
    expect(mockGetAdjacentReportDates).toHaveBeenCalledWith(
      TrendPeriodType.DAILY,
      latestReport.periodStart
    );
  });
});

describe('/api/trends/daily - thumbnail enrichment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.article.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('enriches topArticles with thumbnails from DB when missing', async () => {
    const report = createMockReport('2026-02-20');
    report.topArticles = [
      { id: 'art-1', title: 'Article 1', translatedTitle: null, url: 'https://example.com/1', sourceName: 'Qiita', viewCount: 100, favoriteCount: 10, score: 50, tags: ['AI'] },
    ] as typeof report.topArticles;

    mockGetTrendReport.mockResolvedValueOnce(report);
    mockGetAdjacentReportDates.mockResolvedValueOnce({ prevDate: null, nextDate: null });
    (prisma.article.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'art-1', title: 'Article 1', translatedTitle: null, thumbnail: 'https://example.com/thumb1.jpg', source: { name: 'Qiita' } },
    ]);

    const response = await GET(createRequest({ date: '2026-02-20' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.topArticles[0].thumbnail).toBe('https://example.com/thumb1.jpg');
    expect(data.evidenceArticles).toBeDefined();
    expect(data.evidenceArticles['art-1'].thumbnail).toBe('https://example.com/thumb1.jpg');
  });

  it('preserves existing thumbnail when topArticle already has one', async () => {
    const report = createMockReport('2026-02-20');
    report.topArticles = [
      { id: 'art-1', title: 'Article 1', translatedTitle: null, url: 'https://example.com/1', sourceName: 'Qiita', viewCount: 100, favoriteCount: 10, score: 50, tags: ['AI'], thumbnail: 'https://existing-thumb.jpg' },
    ] as typeof report.topArticles;

    mockGetTrendReport.mockResolvedValueOnce(report);
    mockGetAdjacentReportDates.mockResolvedValueOnce({ prevDate: null, nextDate: null });
    (prisma.article.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'art-1', title: 'Article 1', translatedTitle: null, thumbnail: 'https://db-thumb.jpg', source: { name: 'Qiita' } },
    ]);

    const response = await GET(createRequest({ date: '2026-02-20' }));
    const data = await response.json();

    expect(data.data.topArticles[0].thumbnail).toBe('https://existing-thumb.jpg');
  });

  it('extracts evidenceArticleIds from aiSummary and fetches article data', async () => {
    const report = createMockReport('2026-02-20');
    report.topArticles = [
      { id: 'art-1', title: 'Article 1', translatedTitle: null, url: 'https://example.com/1', sourceName: 'Qiita', viewCount: 100, favoriteCount: 10, score: 50, tags: ['AI'] },
    ] as typeof report.topArticles;
    (report as Record<string, unknown>).aiSummary = JSON.stringify({
      version: 'trend_ai_summary_v2',
      core: 'Test core',
      keyTopics: [
        { topic: 'AI', whatHappened: 'Test', whyItMatters: 'Test', evidenceArticleIds: ['art-1', 'art-external'] },
      ],
      actions: [
        { action: 'Test', reason: 'Test', articleIds: ['art-2'] },
      ],
    });

    mockGetTrendReport.mockResolvedValueOnce(report);
    mockGetAdjacentReportDates.mockResolvedValueOnce({ prevDate: null, nextDate: null });
    (prisma.article.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'art-1', title: 'Article 1', translatedTitle: null, thumbnail: 'https://thumb1.jpg', source: { name: 'Qiita' } },
      { id: 'art-external', title: 'External Article', translatedTitle: '外部記事', thumbnail: 'https://thumb-ext.jpg', source: { name: 'Zenn' } },
      { id: 'art-2', title: 'Action Article', translatedTitle: null, thumbnail: null, source: { name: 'Hatena' } },
    ]);

    const response = await GET(createRequest({ date: '2026-02-20' }));
    const data = await response.json();

    expect(prisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: expect.arrayContaining(['art-1', 'art-external', 'art-2']) }, isHidden: false },
      })
    );

    expect(data.evidenceArticles['art-external']).toEqual({
      title: 'External Article',
      translatedTitle: '外部記事',
      thumbnail: 'https://thumb-ext.jpg',
      sourceName: 'Zenn',
    });
    expect(data.evidenceArticles['art-2']).toEqual({
      title: 'Action Article',
      translatedTitle: null,
      thumbnail: null,
      sourceName: 'Hatena',
    });
  });

  it('skips DB query when no articles to enrich', async () => {
    const report = createMockReport('2026-02-20');
    report.topArticles = [];

    mockGetTrendReport.mockResolvedValueOnce(report);
    mockGetAdjacentReportDates.mockResolvedValueOnce({ prevDate: null, nextDate: null });

    const response = await GET(createRequest({ date: '2026-02-20' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.article.findMany).not.toHaveBeenCalled();
    expect(data.evidenceArticles).toEqual({});
  });

  it('enriches fallback response with thumbnails', async () => {
    const latestReport = createMockReport('2026-02-18');
    latestReport.topArticles = [
      { id: 'art-1', title: 'Article 1', translatedTitle: null, url: 'https://example.com/1', sourceName: 'Qiita', viewCount: 100, favoriteCount: 10, score: 50, tags: ['AI'] },
    ] as typeof latestReport.topArticles;

    mockGetTrendReport.mockResolvedValueOnce(null);
    mockGetLatestReport.mockResolvedValueOnce(latestReport);
    mockGetAdjacentReportDates.mockResolvedValueOnce({ prevDate: null, nextDate: null });
    (prisma.article.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'art-1', title: 'Article 1', translatedTitle: null, thumbnail: 'https://thumb1.jpg', source: { name: 'Qiita' } },
    ]);

    const response = await GET(createRequest({ date: '2026-02-20' }));
    const data = await response.json();

    expect(data.isFallback).toBe(true);
    expect(data.data.topArticles[0].thumbnail).toBe('https://thumb1.jpg');
    expect(data.evidenceArticles['art-1'].thumbnail).toBe('https://thumb1.jpg');
  });
});
