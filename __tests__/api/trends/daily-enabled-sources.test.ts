/**
 * 日次トレンドレポートの表示で、無効化したソースの記事を出さない（issue #688）
 *
 * 保存済みのレポートは作り直さないので、表示の時点で記事を引き直して除く。
 * route（/api/trends/daily）と Server Component 用の fetchInitialDailyData は同じ形なので両方を見る。
 */
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
    get: jest.fn().mockResolvedValue(null),
    set: mockCacheSet,
    generateCacheKey: jest.fn(
      (prefix: string, opts: { params: { date: string } }) =>
        `${prefix}:${opts.params.date}`
    ),
  })),
}));

jest.mock('@/lib/middleware/with-cron-or-admin-auth', () => ({
  withCronOrAdminAuth: jest.fn((handler: unknown) => handler),
}));

import { NextRequest } from 'next/server';
import { TrendPeriodType } from '@/lib/prisma-exports';
import { GET } from '@/app/api/trends/daily/route';
import { fetchInitialDailyData } from '@/app/trends/daily/_components/daily-data';
import { enabledSourceWhere } from '@/lib/database/enabled-source-filter';

// lib/prisma は jest.setup.node.js がモックした PrismaClient（= prismaMock）を返す
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prismaMock } = require('../../../test/utils/prisma-mock');

function createReport() {
  const periodStart = new Date('2026-09-30T00:00:00+09:00');
  return {
    id: 'report-1',
    periodType: TrendPeriodType.DAILY,
    periodStart,
    periodEnd: new Date(periodStart.getTime() + 24 * 60 * 60 * 1000),
    generatedAt: new Date('2026-10-01T03:00:00Z'),
    totalArticles: 3,
    topArticles: [
      { id: 'enabled-1', title: 'E1', thumbnail: 'https://example.com/e1.png' },
      {
        id: 'disabled-1',
        title: 'D1',
        thumbnail: 'https://example.com/d1.png',
      },
      { id: 'enabled-2', title: 'E2' },
    ],
    categories: [
      {
        name: 'Frontend',
        count: 2,
        percentage: 50,
        topArticle: { id: 'enabled-2', title: 'E2', translatedTitle: null },
      },
      {
        name: 'Backend',
        count: 1,
        percentage: 50,
        topArticle: { id: 'disabled-2', title: 'D2', translatedTitle: null },
      },
      { name: 'Other', count: 0, percentage: 0, topArticle: null },
    ],
    aiSummary: JSON.stringify({
      keyTopics: [{ evidenceArticleIds: ['enabled-1', 'disabled-1'] }],
    }),
  };
}

// 無効なソースの記事（disabled-1）は、条件付きの findMany から返らない
const FETCHED_ARTICLES = [
  {
    id: 'enabled-1',
    title: 'E1',
    translatedTitle: null,
    thumbnail: 'https://example.com/e1.png',
    source: { name: 'Enabled' },
  },
  {
    id: 'enabled-2',
    title: 'E2',
    translatedTitle: null,
    thumbnail: 'https://example.com/e2.png',
    source: { name: 'Enabled' },
  },
];

const expectEnabledSourceQuery = () => {
  expect(prismaMock.article.findMany).toHaveBeenCalledTimes(1);
  const { where } = prismaMock.article.findMany.mock.calls[0][0];
  expect(where).toEqual({
    id: { in: ['enabled-1', 'disabled-1', 'enabled-2', 'disabled-2'] },
    isHidden: false,
    AND: [enabledSourceWhere()],
  });
};

describe('日次トレンドの表示から無効化したソースの記事を除く（issue #688）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.article.findMany.mockReset();
    prismaMock.article.findMany.mockResolvedValue(FETCHED_ARTICLES);
    mockGetTrendReport.mockResolvedValue(createReport());
    mockGetAdjacentReportDates.mockResolvedValue({
      prevDate: null,
      nextDate: null,
    });
  });

  it('GET /api/trends/daily: 引き直した記事に無い topArticles と根拠記事を落とす', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/trends/daily?date=2026-09-30')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expectEnabledSourceQuery();
    expect(body.data.topArticles.map((a: { id: string }) => a.id)).toEqual([
      'enabled-1',
      'enabled-2',
    ]);
    // thumbnail が無かった記事は引き直した値で補う
    expect(body.data.topArticles[1].thumbnail).toBe(
      'https://example.com/e2.png'
    );
    expect(Object.keys(body.evidenceArticles).sort()).toEqual([
      'enabled-1',
      'enabled-2',
    ]);
    // カテゴリの代表記事も、引き直した記事に無いものは外す
    expect(
      body.data.categories.map(
        (c: { topArticle: { id: string } | null }) => c.topArticle?.id ?? null
      )
    ).toEqual(['enabled-2', null, null]);
  });

  it('fetchInitialDailyData: 同じく落とす', async () => {
    const result = await fetchInitialDailyData();

    expect(result.success).toBe(true);
    expectEnabledSourceQuery();
    const topArticles = (
      result.data as unknown as { topArticles: { id: string }[] }
    ).topArticles;
    expect(topArticles.map((a) => a.id)).toEqual(['enabled-1', 'enabled-2']);
    const categories = (
      result.data as unknown as {
        categories: { topArticle: { id: string } | null }[];
      }
    ).categories;
    expect(categories.map((c) => c.topArticle?.id ?? null)).toEqual([
      'enabled-2',
      null,
      null,
    ]);
    expect(Object.keys(result.evidenceArticles ?? {}).sort()).toEqual([
      'enabled-1',
      'enabled-2',
    ]);
  });

  it('記事の引き直しに失敗したら、確かめられなかった記事は出さない', async () => {
    prismaMock.article.findMany.mockRejectedValueOnce(new Error('db down'));

    const response = await GET(
      new NextRequest('http://localhost:3000/api/trends/daily?date=2026-09-30')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.topArticles).toEqual([]);
    expect(
      body.data.categories.map((c: { topArticle: unknown }) => c.topArticle)
    ).toEqual([null, null, null]);
    expect(body.evidenceArticles).toEqual({});
    // 一時的な失敗の応答は残さない
    expect(mockCacheSet).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('fetchInitialDailyData: 引き直しに失敗したら出さず、キャッシュにも残さない', async () => {
    prismaMock.article.findMany.mockRejectedValueOnce(new Error('db down'));

    const result = await fetchInitialDailyData();

    expect(result.success).toBe(true);
    expect(
      (result.data as unknown as { topArticles: unknown[] }).topArticles
    ).toEqual([]);
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it('確かめられた応答はキャッシュする', async () => {
    await GET(
      new NextRequest('http://localhost:3000/api/trends/daily?date=2026-09-30')
    );
    await fetchInitialDailyData();

    expect(mockCacheSet).toHaveBeenCalledTimes(2);
  });
});
