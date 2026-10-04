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
    expect(whereOf().AND).toContainEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([
          { isHidden: false },
          { source: { is: { enabled: true } } },
        ]),
      })
    );
  });

  it('filters by the IDs of all tags with the same key', async () => {
    // 統合前の重複（MCP と Mcp）があれば両方の ID を使う
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { id: 'tag-MCP' },
      { id: 'tag-Mcp' },
    ]);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/articles/popular?category=mcp')
    );

    expect(response.status).toBe(200);
    expect(prismaMock.$queryRaw.mock.calls[0]).toContainEqual(['mcp']);
    expect(JSON.stringify(whereOf())).toContain(
      JSON.stringify({
        tags: { some: { id: { in: ['tag-MCP', 'tag-Mcp'] } } },
      }).slice(1, -1)
    );
    expect(JSON.stringify(whereOf())).not.toContain('insensitive');
  });

  it('falls back to the source name when no tag matches', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([]);

    await GET(
      new NextRequest(
        'http://localhost:3000/api/articles/popular?category=Qiita'
      )
    );

    expect(JSON.stringify(whereOf())).toContain('"source":{"name":"Qiita"}');
  });
  it('rejects the removed votes metric', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/articles/popular?metric=votes')
    );
    expect(response.status).toBe(400);
    expect(prismaMock.article.findMany).not.toHaveBeenCalled();
  });

  it('combined ranking ignores user votes', async () => {
    const publishedAt = new Date();
    prismaMock.article.findMany.mockResolvedValue([
      {
        id: 'no-votes',
        publishedAt,
        bookmarks: 10,
        qualityScore: 50,
        userVotes: 0,
      },
      {
        id: 'many-votes',
        publishedAt,
        bookmarks: 10,
        qualityScore: 50,
        userVotes: 100000,
      },
    ]);
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/articles/popular?metric=combined'
      )
    );
    const data = await response.json();
    expect(data.articles[0].score).toBe(data.articles[1].score);
    expect(data.articles[0].score).toBeCloseTo(44, 1);
  });

  // 経過日数を記事ごとに Date.now() で測ると、計算の間に時刻が進んだだけで同じ公開時刻の
  // 記事のスコアがずれる（CI でまれに落ちていた）。呼ぶたびに 1ms 進めて確実に再現する
  it('combined score uses one reference time for all articles', async () => {
    const publishedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    let fakeNow = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => fakeNow++);
    prismaMock.article.findMany.mockResolvedValue(
      ['a', 'b', 'c'].map((id) => ({
        id,
        publishedAt,
        bookmarks: 10,
        qualityScore: 50,
        userVotes: 0,
      }))
    );

    try {
      const response = await GET(
        new NextRequest(
          'http://localhost:3000/api/articles/popular?metric=combined'
        )
      );
      const data = await response.json();
      const scores = data.articles.map((a: { score: number }) => a.score);
      expect(new Set(scores).size).toBe(1);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
