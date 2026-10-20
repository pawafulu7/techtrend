/**
 * トレンドページの Server Component 用の取得（trends-data.ts）が、キャッシュが無いときに
 * 無効化したソースの記事を数えないこと（issue #688）。
 *
 * route（/api/trends/keywords・/api/trends/analysis・/api/stats）と同じキャッシュキーを読むので、
 * DB から直接引く経路も route と同じ条件にそろえる。
 */
jest.mock('@/lib/cache/keywords-cache', () => ({
  keywordsCache: {
    getOrSetWithLock: jest.fn((_key: string, fn: () => Promise<unknown>) =>
      fn()
    ),
  },
}));
jest.mock('@/lib/cache/trends-cache', () => ({
  trendsCache: {
    getOrSetWithLock: jest.fn((_key: string, fn: () => Promise<unknown>) =>
      fn()
    ),
    generateTrendsKey: jest.fn(() => 'trends:test'),
  },
}));
jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    getOrSetWithLockWithMeta: jest.fn(
      async (_key: string, fn: () => Promise<unknown>) => ({
        value: await fn(),
        cacheHit: false,
      })
    ),
  })),
}));

import {
  fetchAnalysisData,
  fetchKeywordsData,
  fetchSourceData,
} from '@/app/trends/_components/trends-data';
import { enabledSourceWhere } from '@/lib/database/enabled-source-filter';
import {
  ENABLED_SOURCE_SQL,
  expectAnalysisPeriodSql,
  isStatsPeriodCountQuery,
  sqlFragmentsOf,
} from '../../helpers/sql-fragments';

// lib/prisma は jest.setup.node.js がモックした PrismaClient（= prismaMock）を返す
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prismaMock } = require('../../../test/utils/prisma-mock');

const ENABLED = `a."sourceId" ${ENABLED_SOURCE_SQL}`;

describe('trends-data: 無効化したソースの記事を数えない（issue #688）', () => {
  beforeEach(() => {
    prismaMock.$queryRaw.mockReset();
    // /stats の 7 日の件数（COUNT(*) の 1 行）のほかは空
    prismaMock.$queryRaw.mockImplementation(async (...call: unknown[]) =>
      isStatsPeriodCountQuery(call) ? [{ count: 0 }] : []
    );
  });

  it('fetchKeywordsData: 区間別の集計と、新規タグの判定の内側', async () => {
    await fetchKeywordsData();

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    const [buckets, newTags] = prismaMock.$queryRaw.mock.calls;
    for (const call of [buckets, newTags]) {
      const sql = sqlFragmentsOf(call).join(' ');
      expect(sql).toContain(ENABLED);
      expect(sql).toContain('a."isHidden" = false');
    }
    const newSql = sqlFragmentsOf(newTags).join(' ');
    expect(newSql).toContain(`a2."sourceId" ${ENABLED_SOURCE_SQL}`);
    expect(newSql).toContain('a2."isHidden" = false');
  });

  it('fetchAnalysisData: 上位タグとその時系列', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { name: 'React', total_count: BigInt(3) },
    ]);

    const calledAt = Date.now();
    await fetchAnalysisData(30);
    const calledBetween = [calledAt, Date.now()] as const;

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    for (const call of prismaMock.$queryRaw.mock.calls) {
      expectAnalysisPeriodSql(call, { days: 30, calledBetween });
    }
    // 日別のまとめは日本時間の暦日（0 で埋める日付と同じ区切り）
    const [, timeline] = prismaMock.$queryRaw.mock.calls;
    expect((timeline[0] as readonly string[]).join('')).toContain(
      `TO_CHAR(a."publishedAt" AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD')`
    );
  });

  it('fetchSourceData: 構成比の分母も有効なソースの記事だけで数える', async () => {
    prismaMock.article.count.mockReset();
    prismaMock.article.count.mockResolvedValue(10);
    prismaMock.source.findMany.mockReset();
    prismaMock.source.findMany.mockResolvedValue([
      { id: 's1', name: 'S1', _count: { articles: 4 } },
    ]);

    const data = await fetchSourceData();

    expect(prismaMock.article.count).toHaveBeenCalledWith({
      where: { AND: [enabledSourceWhere()] },
    });
    expect(data.items).toEqual([{ name: 'S1', value: 4, percentage: 40 }]);
    // 集計時刻を画面に出す（issue #707）
    expect(data.aggregatedAt).toEqual(expect.any(String));
  });

  it('fetchSourceData: 「その他」の構成比を各ソースと同じ小数第1位に丸める', async () => {
    prismaMock.article.count.mockReset();
    prismaMock.article.count.mockResolvedValue(1000);
    prismaMock.source.findMany.mockReset();
    // 7番目以降（0.1% と 0.2%）を足すと、丸めなければ 0.30000000000000004 になる
    prismaMock.source.findMany.mockResolvedValue([
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `s${i}`,
        name: `S${i}`,
        _count: { articles: 100 },
      })),
      { id: 's6', name: 'S6', _count: { articles: 1 } },
      { id: 's7', name: 'S7', _count: { articles: 2 } },
    ]);

    const { items } = await fetchSourceData();

    expect(items.at(-1)).toEqual({ name: 'その他', value: 3, percentage: 0.3 });
  });

  it('fetchSourceData: 「その他」の構成比を、丸め済みの割合の和ではなく件数から求める', async () => {
    prismaMock.article.count.mockReset();
    prismaMock.article.count.mockResolvedValue(10000);
    prismaMock.source.findMany.mockReset();
    // 7番目以降は各 0.04%（丸めると 0%）。割合を足すと 0% になるが、件数では 40/10000 = 0.4%
    prismaMock.source.findMany.mockResolvedValue([
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `s${i}`,
        name: `S${i}`,
        _count: { articles: 1660 },
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `o${i}`,
        name: `O${i}`,
        _count: { articles: 4 },
      })),
    ]);

    const { items } = await fetchSourceData();

    expect(items.at(-1)).toEqual({
      name: 'その他',
      value: 40,
      percentage: 0.4,
    });
  });
});

// 失敗を空の一覧や null に変えると、画面で「該当なし」と区別できない（issue #701）
describe('trends-data: 取得の失敗を空として返さない（issue #701）', () => {
  const dbError = new Error('connection refused');

  beforeEach(() => {
    prismaMock.$queryRaw.mockReset();
    prismaMock.$queryRaw.mockRejectedValue(dbError);
  });

  it('fetchKeywordsData は失敗を投げ直す', async () => {
    await expect(fetchKeywordsData()).rejects.toThrow('connection refused');
  });

  it('fetchAnalysisData は失敗を投げ直す', async () => {
    await expect(fetchAnalysisData(7)).rejects.toThrow('connection refused');
  });

  it('fetchSourceData は失敗を投げ直す', async () => {
    prismaMock.article.count.mockReset();
    prismaMock.article.count.mockRejectedValue(dbError);
    prismaMock.source.findMany.mockReset();
    prismaMock.source.findMany.mockResolvedValue([]);

    await expect(fetchSourceData()).rejects.toThrow('connection refused');
  });
});
