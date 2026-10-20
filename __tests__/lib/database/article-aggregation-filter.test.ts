/**
 * 公開集計の期間の条件（lib/database/article-aggregation-filter.ts）の SQL の形。
 * 期間は Z 付きの ISO 文字列を ::timestamptz で読む（Date のまま渡すと、pg アダプターがオフセット無しで送り、
 * セッションのタイムゾーンで読まれる）。実 DB での件数は new-tags.db.test.ts と
 * __tests__/integration/lib/ のタイムゾーンのテストで確かめる。
 */
import {
  articleAggregationSql,
  publishedAtPeriodSql,
} from '@/lib/database/article-aggregation-filter';
import { ENABLED_SOURCE_SQL } from '../../helpers/sql-fragments';

const from = new Date('2026-10-01T00:00:00.000Z');
const to = new Date('2026-10-08T00:00:00.000Z');

const normalized = (sql: { sql: string }) =>
  sql.sql.replace(/\s+/g, ' ').trim();

describe('publishedAtPeriodSql', () => {
  it('from と to で [from, to) の条件を作る', () => {
    const sql = publishedAtPeriodSql('a', { from, to });
    expect(normalized(sql)).toBe(
      'a."publishedAt" >= ?::timestamptz AND a."publishedAt" < ?::timestamptz'
    );
    expect(sql.values).toEqual([from.toISOString(), to.toISOString()]);
  });

  it('片方だけなら、その条件だけを作る', () => {
    const fromOnly = publishedAtPeriodSql('a2', { from });
    expect(normalized(fromOnly)).toBe('a2."publishedAt" >= ?::timestamptz');
    expect(fromOnly.values).toEqual([from.toISOString()]);

    const toOnly = publishedAtPeriodSql('a', { to });
    expect(normalized(toOnly)).toBe('a."publishedAt" < ?::timestamptz');
    expect(toOnly.values).toEqual([to.toISOString()]);
  });

  it('from も to も無いとき、表に無い別名のときは作らない', () => {
    expect(() => publishedAtPeriodSql('a', {})).toThrow(
      'from or to is required'
    );
    expect(() =>
      publishedAtPeriodSql('b' as unknown as 'a', { from, to })
    ).toThrow('Unsupported article alias');
  });
});

describe('articleAggregationSql', () => {
  it('非表示でない・有効なソース・期間を AND でつなぐ', () => {
    const sql = articleAggregationSql('a', { from, to });
    expect(normalized(sql)).toBe(
      `a."isHidden" = false AND a."sourceId" ${ENABLED_SOURCE_SQL} AND a."publishedAt" >= ?::timestamptz AND a."publishedAt" < ?::timestamptz`
    );
    expect(sql.values).toEqual([from.toISOString(), to.toISOString()]);
  });

  it('上限だけ・期間なしの形', () => {
    const toOnly = articleAggregationSql('a2', { to });
    expect(normalized(toOnly)).toBe(
      `a2."isHidden" = false AND a2."sourceId" ${ENABLED_SOURCE_SQL} AND a2."publishedAt" < ?::timestamptz`
    );
    expect(toOnly.values).toEqual([to.toISOString()]);

    const all = articleAggregationSql();
    expect(normalized(all)).toBe(
      `a."isHidden" = false AND a."sourceId" ${ENABLED_SOURCE_SQL}`
    );
    expect(all.values).toEqual([]);
  });
});
