/**
 * /api/stats: 件数・日別・人気タグから、無効化したソースの記事を除く（issue #688）
 *
 * 人気タグの件数と順位は tag-article-counts のテスト DB のテストで確かめる。
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

describe('GET /api/stats（キャッシュなし）', () => {
  beforeEach(() => {
    prismaMock.article.count.mockReset();
    prismaMock.article.count.mockResolvedValue(10);
    prismaMock.source.findMany.mockReset();
    prismaMock.source.findMany.mockResolvedValue([
      { id: 's1', name: 'S1', _count: { articles: 4 } },
    ]);
    prismaMock.$queryRaw.mockReset();
    prismaMock.$queryRaw.mockResolvedValue([
      { date: '2026-10-01', sourceName: 'S1', count: 2 },
    ]);
    mockFindTopTags.mockReset();
    mockFindTopTags.mockResolvedValue([
      { id: 't1', name: 'React', category: null, count: 5 },
    ]);
  });

  it('総数・7 日・30 日の件数、日別、人気タグのどれも無効化したソースの記事を数えない', async () => {
    const response = await (GET as () => Promise<Response>)();
    const body = await response.json();

    expect(response.status).toBe(200);

    // 件数の 3 つ
    expect(prismaMock.article.count).toHaveBeenCalledTimes(3);
    for (const [args] of prismaMock.article.count.mock.calls) {
      expect(args.where.AND).toEqual([enabledSourceWhere()]);
    }

    // 日別の生 SQL
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(
      sqlFragmentsOf(prismaMock.$queryRaw.mock.calls[0], { afterAnd: true })
    ).toEqual([`a."sourceId" ${ENABLED_SOURCE_SQL}`]);

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
});
