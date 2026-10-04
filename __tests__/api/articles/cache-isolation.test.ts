// Redis の保存部分だけをメモリに置き換え、実際の LayeredCache と GET を通して検証する。
jest.mock('@/lib/cache/index', () => {
  const storage = new Map<string, unknown>();
  return {
    __resetCache: () => storage.clear(),
    RedisCache: jest
      .fn()
      .mockImplementation(({ namespace }: { namespace: string }) => {
        const getOrSet = async (
          key: string,
          fetcher: () => Promise<unknown>
        ) => {
          const fullKey = `${namespace}:${key}`;
          if (storage.has(fullKey)) return storage.get(fullKey);
          const value = await fetcher();
          storage.set(fullKey, value);
          return value;
        };
        return { getOrSet, getOrSetWithLock: getOrSet };
      }),
  };
});

import { GET } from '@/app/api/articles/route';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

const { __resetCache: resetCache } = jest.requireMock('@/lib/cache/index');
const findMany = jest.mocked(prisma.article.findMany);
const count = jest.mocked(prisma.article.count);

describe('/api/articles cache isolation', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-15T12:00:00Z'));
    resetCache();
    findMany.mockReset();
    count.mockReset();
    count.mockResolvedValue(10);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function request(query: string) {
    const response = await GET(
      new NextRequest(`http://localhost/api/articles?${query}`)
    );
    expect(response.status).toBe(200);
    return (await response.json()).data;
  }

  describe.each(['', 'search=React'])('query %s', (baseQuery) => {
    it.each(['lightweight=true', 'fields=title', 'includeRelations=true'])(
      'keeps the response for %s separate and shares the count',
      async (displayQuery) => {
        const defaultItems = [
          { id: 'full', title: 'Full article', qualityScore: 80 },
        ];
        const changedItems = [{ id: 'changed', title: 'Changed selection' }];
        findMany
          .mockResolvedValueOnce(
            defaultItems as Awaited<ReturnType<typeof findMany>>
          )
          .mockResolvedValueOnce(
            changedItems as Awaited<ReturnType<typeof findMany>>
          );

        expect((await request(baseQuery)).items).toEqual(defaultItems);
        expect((await request(`${baseQuery}&${displayQuery}`)).items).toEqual(
          changedItems
        );
        expect((await request(baseQuery)).items).toEqual(defaultItems);
        expect((await request(`${baseQuery}&${displayQuery}`)).items).toEqual(
          changedItems
        );
        expect(findMany).toHaveBeenCalledTimes(2);
        expect(count).toHaveBeenCalledTimes(1);

        const defaultSelect = findMany.mock.calls[0][0]?.select;
        const changedSelect = findMany.mock.calls[1][0]?.select;
        expect(defaultSelect).not.toEqual(changedSelect);
      }
    );

    it.each([
      'includeEmptyContent=true',
      'excludeUnprocessed=true',
      'excludeLowQuality=true',
    ])('keeps both items and counts separate for %s', async (filterQuery) => {
      findMany.mockResolvedValue([]);
      count.mockResolvedValueOnce(10).mockResolvedValueOnce(3);

      expect((await request(baseQuery)).total).toBe(10);
      expect((await request(`${baseQuery}&${filterQuery}`)).total).toBe(3);
      expect((await request(baseQuery)).total).toBe(10);
      expect((await request(`${baseQuery}&${filterQuery}`)).total).toBe(3);
      expect(findMany).toHaveBeenCalledTimes(2);
      expect(count).toHaveBeenCalledTimes(2);
      expect(count.mock.calls[0][0]?.where).not.toEqual(
        count.mock.calls[1][0]?.where
      );
    });
  });

  it('separates counts when sortBy changes the field used for the date filter', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValueOnce(10).mockResolvedValueOnce(4);
    expect(
      (await request('dateFrom=2026-01-01&sortBy=publishedAt')).total
    ).toBe(10);
    expect((await request('dateFrom=2026-01-01&sortBy=createdAt')).total).toBe(
      4
    );
    expect(count).toHaveBeenCalledTimes(2);
    expect(count.mock.calls[0][0]?.where).not.toEqual(
      count.mock.calls[1][0]?.where
    );
  });
});
