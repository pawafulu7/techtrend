/**
 * articleDetailCache.getRelatedArticles（タグでの関連記事。埋め込みの関連記事が無いときの代替）
 *
 * issue #688: 無効化したソースの記事を関連記事に出さない。条件そのものの正しさは
 * __tests__/lib/database/enabled-source-filter.db.test.ts がテスト DB で確かめる。
 * ここでは、このクエリが条件を使っていることを確かめる。
 */
// article-detail-cache は './redis-cache' を相対パスで読むので、同じ実ファイルを相対パスで差し替える
jest.mock('../../../lib/cache/redis-cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

import { articleDetailCache } from '@/lib/cache/article-detail-cache';
import { ENABLED_SOURCE_SQL, sqlFragmentsOf } from '../../helpers/sql-fragments';

// lib/prisma は jest.setup.node.js がモックした PrismaClient（= prismaMock）を返す
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prismaMock } = require('../../../test/utils/prisma-mock');

describe('articleDetailCache.getRelatedArticles', () => {
  beforeEach(() => {
    prismaMock.$queryRaw.mockReset();
    prismaMock.$queryRaw.mockResolvedValue([]);
  });

  it('無効化したソースの記事を除く（issue #688）', async () => {
    await articleDetailCache.getRelatedArticles('article-1', ['tag-1']);

    // DB に問い合わせたことを確かめる（届かないと条件の検査が素通りする）
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(
      sqlFragmentsOf(prismaMock.$queryRaw.mock.calls[0], { afterAnd: true })
    ).toContainEqual(
      expect.stringContaining(`a."sourceId" ${ENABLED_SOURCE_SQL}`)
    );
  });
});
