/**
 * /api/stats: 件数・日別・人気タグから、無効化したソースの記事を除く（issue #688）。
 * 7 日・30 日の件数と日別は、期間を [N 日前, 集計の時刻) にし、日別は日本時間の暦日でまとめる（issue #807）
 *
 * 人気タグの件数と順位は tag-article-counts のテスト DB のテストで確かめる。セッションのタイムゾーンを
 * UTC 以外にした実 DB での期間と日付の区切りは __tests__/integration/lib/dashboard-stats-timezone.test.ts。
 */
jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    getOrSetWithLockWithMeta: jest.fn(
      async (_key: string, fetcher: () => Promise<unknown>) => ({
        value: await fetcher(),
        cacheHit: false,
      })
    ),
  })),
}));
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_key: string, handler: unknown) => handler),
}));
const mockFindTopTags = jest.fn();
// 第 1 引数の prisma は jest-mock-extended の Proxy で、expect.anything() が使えないので、条件（第 2 引数）だけを見る
const lastOptions = () => mockFindTopTags.mock.calls.at(-1)?.[1];
jest.mock('@/lib/database/tag-article-counts', () => ({
  findTopTags: (...args: unknown[]) => mockFindTopTags(...args),
}));

import { GET } from '@/app/api/stats/route';
import { enabledSourceWhere } from '@/lib/database/enabled-source-filter';
import { ENABLED_SOURCE_SQL, sqlFragmentsOf } from '../helpers/sql-fragments';

// lib/prisma は jest.setup.node.js がモックした PrismaClient（= prismaMock）を返す
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prismaMock } = require('../../test/utils/prisma-mock');

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type RawCall = [readonly string[], ...unknown[]];

/** 問い合わせの期間の断片（publishedAtPeriodSql）。無ければ undefined */
function periodOf(call: RawCall) {
  return call
    .slice(1)
    .map((value) => value as { sql?: unknown; values?: unknown[] } | null)
    .find(
      (value) =>
        typeof value?.sql === 'string' && value.sql.includes('"publishedAt"')
    ) as { sql: string; values: unknown[] } | undefined;
}

/** 期間の日数（from と to の差） */
function periodDays(call: RawCall): number {
  const [from, to] = periodOf(call)?.values ?? [];
  return (Date.parse(String(to)) - Date.parse(String(from))) / DAY_MS;
}

const isDailyCall = (call: RawCall) => call[0].join('?').includes('TO_CHAR');

describe('GET /api/stats（キャッシュなし）', () => {
  beforeEach(() => {
    prismaMock.article.count.mockReset();
    prismaMock.article.count.mockResolvedValue(10);
    prismaMock.source.findMany.mockReset();
    prismaMock.source.findMany.mockResolvedValue([
      { id: 's1', name: 'S1', _count: { articles: 4 } },
    ]);
    prismaMock.$queryRaw.mockReset();
    // 日別は日付とソースの行を、7 日・30 日の件数は期間の日数を件数として返す
    prismaMock.$queryRaw.mockImplementation(async (...call: RawCall) =>
      isDailyCall(call)
        ? [{ date: '2026-10-01', sourceName: 'S1', count: 2 }]
        : [{ count: periodDays(call) }]
    );
    mockFindTopTags.mockReset();
    mockFindTopTags.mockResolvedValue([
      { id: 't1', name: 'React', category: null, count: 5 },
    ]);
  });

  it('総数・7 日・30 日の件数、日別、人気タグのどれも無効化したソースの記事を数えない', async () => {
    const response = await (GET as () => Promise<Response>)();
    const body = await response.json();

    expect(response.status).toBe(200);

    // 総数
    expect(prismaMock.article.count).toHaveBeenCalledTimes(1);
    expect(prismaMock.article.count.mock.calls[0][0].where.AND).toEqual([
      enabledSourceWhere(),
    ]);

    // 7 日・30 日の件数と日別の生 SQL
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(3);
    for (const call of prismaMock.$queryRaw.mock.calls) {
      expect(sqlFragmentsOf(call, { afterAnd: true })).toEqual([
        `a."sourceId" ${ENABLED_SOURCE_SQL}`,
      ]);
    }

    // 人気タグ
    expect(mockFindTopTags.mock.calls[0][0]).toBe(prismaMock);
    expect(lastOptions()).toEqual({
      limit: 10,
    });
    expect(body.data.tags).toEqual([{ id: 't1', name: 'React', count: 5 }]);
    expect(body.data.sources[0]).toEqual({
      id: 's1',
      name: 'S1',
      count: 4,
      percentage: 40,
    });
  });

  it('7 日・30 日の件数と日別は、期間を [N 日前, 集計の時刻) にし、ISO 文字列を ::timestamptz で読む', async () => {
    const calledAt = Date.now();
    const response = await (GET as () => Promise<Response>)();
    const finishedAt = Date.now();
    const body = await response.json();

    const calls = prismaMock.$queryRaw.mock.calls as RawCall[];
    const periods = calls.map((call) => {
      const period = periodOf(call);
      expect(period?.sql.replace(/\s+/g, ' ').trim()).toBe(
        'a."publishedAt" >= ?::timestamptz AND a."publishedAt" < ?::timestamptz'
      );
      const [from, to] = period?.values ?? [];
      expect(from).toMatch(ISO_UTC);
      expect(to).toMatch(ISO_UTC);
      const toMs = Date.parse(String(to));
      expect({
        toIsBetweenCall: toMs >= calledAt && toMs <= finishedAt,
      }).toEqual({ toIsBetweenCall: true });
      return { daily: isDailyCall(call), days: periodDays(call), to };
    });
    // 3 つとも同じ集計の時刻を上限にする
    expect(new Set(periods.map((p) => p.to)).size).toBe(1);
    expect(
      periods
        .map(({ daily, days }) => ({ daily, days }))
        .sort((a, b) => Number(a.daily) - Number(b.daily) || a.days - b.days)
    ).toEqual([
      { daily: false, days: 7 },
      { daily: false, days: 30 },
      { daily: true, days: 30 },
    ]);

    // 日別は日本時間の暦日でまとめる
    const dailySql = calls.find(isDailyCall)?.[0].join('?') ?? '';
    expect(dailySql).toMatch(
      /TO_CHAR\(a\."publishedAt" AT TIME ZONE 'Asia\/Tokyo', 'YYYY-MM-DD'\)/
    );
    expect(dailySql).not.toMatch(/NOW\(\)/i);

    // 件数は期間ごとの問い合わせの結果から作る（モックは期間の日数を件数として返す）
    expect(body.data.overview).toEqual({
      total: 10,
      last7Days: 7,
      last30Days: 30,
      averagePerDay: 1,
    });
    expect(body.data.daily).toEqual([
      { date: '2026-10-01', total: 2, sources: { S1: 2 } },
    ]);
  });
});
