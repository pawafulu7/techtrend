/**
 * トレンドページの Server Component 用の取得（trends-data.ts）が、キャッシュが無いときに
 * 無効化したソースの記事を数えないこと（issue #688）。
 *
 * route（/api/trends/keywords・/api/trends/analysis・/api/stats）と同じキャッシュキーを読むので、
 * DB から直接引く経路も route と同じ条件にそろえる。
 */
jest.mock('@/lib/cache/keywords-cache', () => ({
  keywordsCache: { get: jest.fn().mockResolvedValue(null) },
}));
jest.mock('@/lib/cache/trends-cache', () => ({
  trendsCache: {
    get: jest.fn().mockResolvedValue(null),
    generateTrendsKey: jest.fn(() => 'trends:test'),
  },
}));
jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
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
  sqlFragmentsOf,
} from '../../helpers/sql-fragments';

// lib/prisma は jest.setup.node.js がモックした PrismaClient（= prismaMock）を返す
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prismaMock } = require('../../../test/utils/prisma-mock');

const ENABLED = `a."sourceId" ${ENABLED_SOURCE_SQL}`;

describe('trends-data: 無効化したソースの記事を数えない（issue #688）', () => {
  beforeEach(() => {
    prismaMock.$queryRaw.mockReset();
    prismaMock.$queryRaw.mockResolvedValue([]);
  });

  it('fetchKeywordsData: 3 つの集計と、新規タグの判定の内側', async () => {
    await fetchKeywordsData();

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(3);
    const [recent, weekly, newTags] = prismaMock.$queryRaw.mock.calls;
    expect(sqlFragmentsOf(recent, { afterAnd: true })).toEqual([ENABLED]);
    expect(sqlFragmentsOf(weekly, { afterAnd: true })).toEqual([ENABLED]);
    expect(sqlFragmentsOf(newTags, { afterAnd: true })).toEqual([
      ENABLED,
      `a2."sourceId" ${ENABLED_SOURCE_SQL}`,
    ]);
  });

  it('fetchAnalysisData: 上位タグとその時系列', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { name: 'React', total_count: BigInt(3) },
    ]);

    await fetchAnalysisData(30);

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    for (const call of prismaMock.$queryRaw.mock.calls) {
      expect(sqlFragmentsOf(call, { afterAnd: true })).toEqual([ENABLED]);
    }
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
    expect(data).toEqual([{ name: 'S1', value: 4, percentage: 40 }]);
  });
});
