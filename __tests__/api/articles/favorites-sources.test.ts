/**
 * GET /api/articles/favorites（お気に入りソースの記事一覧）
 *
 * issue #688: 無効化したソースの記事を除く。一覧と件数に同じ条件を掛ける。
 */
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/articles/favorites/route';

// lib/prisma は jest.setup.node.js がモックした PrismaClient（= prismaMock）を返す
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prismaMock } = require('../../../test/utils/prisma-mock');

describe('GET /api/articles/favorites', () => {
  beforeEach(() => {
    prismaMock.article.findMany.mockReset();
    prismaMock.article.count.mockReset();
    prismaMock.article.findMany.mockResolvedValue([]);
    prismaMock.article.count.mockResolvedValue(0);
  });

  it('無効化したソースの記事を、一覧と件数の両方で除く（issue #688）', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/articles/favorites?sourceIds=src-1,src-2'
      )
    );

    expect(response.status).toBe(200);
    expect(prismaMock.article.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.article.count).toHaveBeenCalledTimes(1);
    for (const mock of [
      prismaMock.article.findMany,
      prismaMock.article.count,
    ]) {
      const where = mock.mock.calls[0][0].where;
      expect(where).toMatchObject({
        isHidden: false,
        sourceId: { in: ['src-1', 'src-2'] },
      });
      expect(where.AND).toContainEqual({ source: { is: { enabled: true } } });
    }
  });
});
