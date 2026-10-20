/**
 * /api/stats: 件数・日別・人気タグから、無効化したソースの記事を除く（issue #688）。
 * 7 日の件数と日別は、期間を [N 日前, 集計の時刻) にし、日別は日本時間の暦日でまとめて 0 件の日も入れる。
 * 30 日の件数は日別の合計。非表示の記事は、このページのほかの件数と同じく数える（issue #807）
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
import {
  ENABLED_SOURCE_SQL,
  fullSqlOf,
  sqlFragmentsOf,
} from '../helpers/sql-fragments';

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

/** 日本時間の暦日（実装とは別の計算で出す） */
const jstDate = (date: Date) =>
  new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const nextDay = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00.000Z`) + DAY_MS)
    .toISOString()
    .slice(0, 10);
const YESTERDAY = jstDate(new Date(Date.now() - DAY_MS));
const THREE_DAYS_AGO = jstDate(new Date(Date.now() - 3 * DAY_MS));

describe('GET /api/stats（キャッシュなし）', () => {
  beforeEach(() => {
    prismaMock.article.count.mockReset();
    prismaMock.article.count.mockResolvedValue(10);
    prismaMock.source.findMany.mockReset();
    prismaMock.source.findMany.mockResolvedValue([
      { id: 's1', name: 'S1', _count: { articles: 4 } },
    ]);
    prismaMock.$queryRaw.mockReset();
    // 日別は日付とソースの行を、7 日の件数は期間の日数を件数として返す
    prismaMock.$queryRaw.mockImplementation(async (...call: RawCall) =>
      isDailyCall(call)
        ? [
            { date: YESTERDAY, sourceName: 'S1', count: 30 },
            { date: YESTERDAY, sourceName: 'S2', count: 15 },
            { date: THREE_DAYS_AGO, sourceName: 'S1', count: 45 },
          ]
        : [{ count: periodDays(call) }]
    );
    mockFindTopTags.mockReset();
    mockFindTopTags.mockResolvedValue([
      { id: 't1', name: 'React', category: null, count: 5 },
    ]);
  });

  it('総数・7 日の件数、日別、人気タグのどれも無効化したソースの記事を数えない。非表示の記事は数える', async () => {
    const response = await (GET as () => Promise<Response>)();
    const body = await response.json();

    expect(response.status).toBe(200);

    // 総数
    expect(prismaMock.article.count).toHaveBeenCalledTimes(1);
    expect(prismaMock.article.count.mock.calls[0][0].where.AND).toEqual([
      enabledSourceWhere(),
    ]);

    // 7 日の件数と日別の生 SQL。非表示の条件は付けない（ユーザーの決定。総数・ソース別・人気タグと同じ）
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    for (const call of prismaMock.$queryRaw.mock.calls) {
      expect(sqlFragmentsOf(call, { afterAnd: true })).toEqual([
        `a."sourceId" ${ENABLED_SOURCE_SQL}`,
      ]);
      expect(fullSqlOf(call)).not.toMatch(/isHidden/);
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

  it('7 日の件数と日別は、期間を [N 日前, 集計の時刻) にし、ISO 文字列を ::timestamptz で読む', async () => {
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
    // どちらも同じ集計の時刻を上限にし、それを集計時刻として返す
    expect(new Set(periods.map((p) => p.to)).size).toBe(1);
    expect(body.data.generatedAt).toBe(periods[0].to);
    expect(
      periods
        .map(({ daily, days }) => ({ daily, days }))
        .sort((a, b) => Number(a.daily) - Number(b.daily))
    ).toEqual([
      { daily: false, days: 7 },
      { daily: true, days: 30 },
    ]);

    // 日別は日本時間の暦日でまとめる
    const dailySql = calls.find(isDailyCall)?.[0].join('?') ?? '';
    expect(dailySql).toMatch(
      /TO_CHAR\(a\."publishedAt" AT TIME ZONE 'Asia\/Tokyo', 'YYYY-MM-DD'\)/
    );
    expect(dailySql).not.toMatch(/NOW\(\)/i);

    // 7 日の件数は問い合わせの結果（モックは期間の日数を件数として返す）、30 日の件数は日別の合計
    expect(body.data.overview).toEqual({
      total: 10,
      last7Days: 7,
      last30Days: 90,
      averagePerDay: 3,
    });

    // 日別は日本時間の暦日で期間の両端を含み、記事が 0 件の日も入れる
    const toMs = Date.parse(String(periods[0].to));
    const expectedDates: string[] = [];
    for (
      let day = jstDate(new Date(toMs - 30 * DAY_MS));
      day <= jstDate(new Date(toMs));
      day = nextDay(day)
    ) {
      expectedDates.push(day);
    }
    const daily = body.data.daily as {
      date: string;
      total: number;
      sources: Record<string, number>;
    }[];
    expect(daily.map((day) => day.date)).toEqual(expectedDates);
    expect(daily.filter((day) => day.total > 0)).toEqual([
      { date: THREE_DAYS_AGO, total: 45, sources: { S1: 45 } },
      { date: YESTERDAY, total: 45, sources: { S1: 30, S2: 15 } },
    ]);
    expect(daily.find((day) => day.total === 0)?.sources).toEqual({});
  });
});
