/**
 * /api/articles/categories: カテゴリ別の件数から、無効化したソースの記事を除く（issue #688）
 */
jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/articles/categories/route';
import { enabledSourceWhere } from '@/lib/database/enabled-source-filter';

// lib/prisma は jest.setup.node.js がモックした PrismaClient（= prismaMock）を返す
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prismaMock } = require('../../../test/utils/prisma-mock');

describe('GET /api/articles/categories', () => {
  beforeEach(() => {
    prismaMock.article.groupBy.mockReset();
    prismaMock.article.groupBy.mockResolvedValue([
      { category: 'frontend', _count: { _all: 3 } },
      { category: null, _count: { _all: 1 } },
    ]);
  });

  it('無効化したソースの記事を数えない', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/articles/categories')
    );

    expect(response.status).toBe(200);
    expect(prismaMock.article.groupBy).toHaveBeenCalledTimes(1);
    expect(prismaMock.article.groupBy.mock.calls[0][0].where).toEqual({
      isHidden: false,
      AND: [enabledSourceWhere()],
    });
    const body = await response.json();
    expect(body.total).toBe(4);
  });
});
