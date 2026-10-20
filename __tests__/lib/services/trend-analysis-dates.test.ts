/**
 * トレンドの分析の日別のまとめの日付（lib/services/trend-analysis.ts の jstDateKey・jstDateKeys）。
 * SQL の TO_CHAR(publishedAt AT TIME ZONE 'Asia/Tokyo', …) と同じ、日本時間の暦日で並べる。
 * DB のセッションのタイムゾーンでの確認は __tests__/integration/lib/trend-analysis-timezone.test.ts
 */
jest.mock('@/lib/cache/trends-cache', () => ({
  trendsCache: {
    getOrSetWithLock: jest.fn(),
    generateTrendsKey: jest.fn(),
  },
}));

import { jstDateKey, jstDateKeys } from '@/lib/services/trend-analysis';

describe('jstDateKey', () => {
  it.each([
    // UTC 14:59 は JST 23:59（同じ日）、UTC 15:00 は JST の翌日 0:00
    ['2026-10-19T14:59:59.999Z', '2026-10-19'],
    ['2026-10-19T15:00:00.000Z', '2026-10-20'],
    ['2026-12-31T15:00:00.000Z', '2027-01-01'],
  ])('%s → %s', (iso, date) => {
    expect(jstDateKey(new Date(iso))).toBe(date);
  });
});

describe('jstDateKeys', () => {
  it('期間の両端の日を含め、日本時間の暦日を古い順に1日ずつ並べる', () => {
    // JST 2026-10-13 08:00 〜 2026-10-20 08:00（7 日）
    expect(
      jstDateKeys(
        new Date('2026-10-12T23:00:00.000Z'),
        new Date('2026-10-19T23:00:00.000Z')
      )
    ).toEqual([
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
    ]);
  });

  it('UTC では前日でも、日本時間の日付で始まる（UTC の日付で作っていた以前の形とは違う）', () => {
    // UTC 2026-10-12 16:00 = JST 2026-10-13 01:00
    const keys = jstDateKeys(
      new Date('2026-10-12T16:00:00.000Z'),
      new Date('2026-10-13T16:00:00.000Z')
    );
    expect(keys).toEqual(['2026-10-13', '2026-10-14']);
  });

  it('同じ日の中なら1日だけ', () => {
    expect(
      jstDateKeys(
        new Date('2026-10-19T15:00:00.000Z'),
        new Date('2026-10-19T16:00:00.000Z')
      )
    ).toEqual(['2026-10-20']);
  });
});
