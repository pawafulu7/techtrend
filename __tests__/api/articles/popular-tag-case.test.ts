/**
 * /api/articles/popular?category= のタグ照合が大文字小文字を区別しないこと（#672）
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
  tag: { findFirst: jest.Mock };
  article: { findMany: jest.Mock };
};

describe('GET /api/articles/popular (category = tag)', () => {
  beforeEach(() => {
    prismaMock.tag.findFirst.mockReset();
    prismaMock.article.findMany.mockReset();
    prismaMock.article.findMany.mockResolvedValue([]);
  });

  it('resolves the tag and filters articles by the tag name case-insensitively', async () => {
    prismaMock.tag.findFirst.mockResolvedValue({ id: 'tag-mcp' });

    const response = await GET(
      new NextRequest('http://localhost:3000/api/articles/popular?category=mcp')
    );

    expect(response.status).toBe(200);
    expect(prismaMock.tag.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { equals: 'mcp', mode: 'insensitive' } },
      })
    );
    const where = prismaMock.article.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain(
      JSON.stringify({
        tags: { some: { name: { equals: 'mcp', mode: 'insensitive' } } },
      }).slice(1, -1)
    );
  });

  it('falls back to the source name when no tag matches', async () => {
    prismaMock.tag.findFirst.mockResolvedValue(null);

    await GET(
      new NextRequest('http://localhost:3000/api/articles/popular?category=Qiita')
    );

    const where = prismaMock.article.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"source":{"name":"Qiita"}');
  });
});
