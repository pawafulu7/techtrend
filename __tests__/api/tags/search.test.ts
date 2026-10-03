/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma');
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: (_key: unknown, fn: unknown) => fn,
}));

import { GET } from '@/app/api/tags/search/route';
import { prisma } from '@/lib/prisma';

const prismaMock = prisma as any;

function request(query: string) {
  return new NextRequest(`http://localhost:3000/api/tags/search${query}`);
}

describe('GET /api/tags/search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.tag.findMany.mockResolvedValue([
      { id: 't1', name: 'a_b', category: null, _count: { articles: 3 } },
    ]);
  });

  it('検索語の LIKE のワイルドカードをエスケープして部分一致させる（#684）', async () => {
    const response = await GET(request('?q=a_b%25'));

    expect(response.status).toBe(200);
    expect(prismaMock.tag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { name: { contains: 'a\\_b\\%', mode: 'insensitive' } },
            { articles: { some: {} } },
          ],
        },
      })
    );
    expect(await response.json()).toEqual([
      { id: 't1', name: 'a_b', count: 3, category: null },
    ]);
  });

  it('検索語がなければ名前の条件を付けずに人気順で返す', async () => {
    const response = await GET(request(''));

    expect(response.status).toBe(200);
    expect(prismaMock.tag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { articles: { some: {} } },
        take: 50,
      })
    );
  });
});
