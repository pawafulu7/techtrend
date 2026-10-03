/**
 * /api/articles/popular?category= のタグ照合（#672）
 * lower(name) で引いたタグの ID で絞ること。Prisma の insensitive（ILIKE）は使わない
 */
jest.mock('@/lib/cache/popular-cache', () => ({
  popularCache: {
    getOrSet: jest.fn((_period: string, fn: () => Promise<unknown>) => fn()),
    generateKey: jest.fn(() => 'popular:test'),
  },
}));

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_type: string, handler: Function) => handler),
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/articles/popular/route';

const prismaMock = prisma as unknown as {
  $queryRaw: jest.Mock;
  article: { findMany: jest.Mock };
};

function whereOf(): Record<string, unknown> {
  return prismaMock.article.findMany.mock.calls[0][0].where;
}

describe('GET /api/articles/popular (category = tag)', () => {
  beforeEach(() => {
    prismaMock.$queryRaw.mockReset();
    prismaMock.article.findMany.mockReset();
    prismaMock.article.findMany.mockResolvedValue([]);
  });

  // issue #688: 無効化したソースの記事を除く
  it('excludes articles from disabled sources', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/articles/popular')
    );

    expect(response.status).toBe(200);
    expect(whereOf().AND).toContainEqual({ source: { is: { enabled: true } } });
  });

  it('filters by the IDs of all tags with the same key', async () => {
    // 統合前の重複（MCP と Mcp）があれば両方の ID を使う
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'tag-MCP' }, { id: 'tag-Mcp' }]);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/articles/popular?category=mcp')
    );

    expect(response.status).toBe(200);
    expect(prismaMock.$queryRaw.mock.calls[0]).toContainEqual(['mcp']);
    expect(JSON.stringify(whereOf())).toContain(
      JSON.stringify({ tags: { some: { id: { in: ['tag-MCP', 'tag-Mcp'] } } } }).slice(1, -1)
    );
    expect(JSON.stringify(whereOf())).not.toContain('insensitive');
  });

  it('falls back to the source name when no tag matches', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([]);

    await GET(
      new NextRequest('http://localhost:3000/api/articles/popular?category=Qiita')
    );

    expect(JSON.stringify(whereOf())).toContain('"source":{"name":"Qiita"}');
  });
});
