jest.mock('@/lib/redis/client', () => {
  const store = new Map<string, string>();
  const client = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      if (store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    }),
    setex: jest.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    eval: jest.fn(
      async (_script: string, _count: number, key: string, token: string) => {
        if (store.get(key) !== token) return 0;
        store.delete(key);
        return 1;
      }
    ),
  };
  return { getRedisClient: () => client, store };
});
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: (_key: string, handler: unknown) => handler,
}));
// Bypass the global alias mapping to the pass-through cache mock.
jest.mock('@/lib/cache', () => {
  const { RedisCache: ActualRedisCache } = jest.requireActual(
    '../../../lib/cache/redis-cache'
  );
  const { getRedisClient } = jest.requireMock('@/lib/redis/client');
  return {
    RedisCache: class extends ActualRedisCache {
      constructor(options: unknown) {
        super(options);
        this.redis = getRedisClient();
      }
    },
  };
});

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  fetchKeywordsData,
  fetchAnalysisData,
  fetchSourceData,
} from '@/app/trends/_components/trends-data';
import { GET as keywordsGet } from '@/app/api/trends/keywords/route';
import { GET as analysisGet } from '@/app/api/trends/analysis/route';
import { GET as statsGet } from '@/app/api/stats/route';
import { GET as newTagsGet } from '@/app/api/tags/new/route';
import { GET as searchGet } from '@/app/api/tags/search/route';
import { RedisCache } from '@/lib/cache';
import { keywordsCache } from '@/lib/cache/keywords-cache';
import { trendsCache } from '@/lib/cache/trends-cache';
import { tagCache } from '@/lib/cache/tag-cache';

// The global Prisma mapping exports the client directly.
const db = prisma as unknown as {
  $queryRaw: jest.Mock;
  article: { count: jest.Mock };
  source: { findMany: jest.Mock };
};
const { getRedisClient, store } = jest.requireMock('@/lib/redis/client');
const redis = getRedisClient();

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
  redis.get.mockImplementation(async (key: string) => store.get(key) ?? null);
  redis.set.mockImplementation(async (key: string, value: string) => {
    if (store.has(key)) return null;
    store.set(key, value);
    return 'OK';
  });
  Object.assign(keywordsCache, { redis });
  Object.assign(trendsCache, { redis });
  Object.assign(tagCache, { cache: new RedisCache({ namespace: 'tag-test' }) });
  db.$queryRaw.mockResolvedValue([]);
  db.article.count.mockResolvedValue(20);
  db.source.findMany.mockResolvedValue([
    { id: 's1', name: 'S1', _count: { articles: 20 } },
  ]);
});

it('page fills the complete keywords payload, including period, for the API', async () => {
  db.$queryRaw
    .mockResolvedValueOnce([{ id: 'r', name: 'React', recent_count: 5n }])
    .mockResolvedValueOnce([{ id: 'r', name: 'React', weekly_count: 12n }])
    .mockResolvedValueOnce([]);
  const page = await fetchKeywordsData();
  const result = await (await keywordsGet()).json();
  expect(result.trending).toEqual(page.trending);
  expect(result.newTags).toEqual(page.newTags);
  expect(result.period.from).toEqual(expect.any(String));
  expect(result.period.to).toEqual(expect.any(String));
  expect(db.$queryRaw).toHaveBeenCalledTimes(3);
});

it('page and API share the complete 7-day analysis, with zero-filled dates', async () => {
  db.$queryRaw
    .mockResolvedValueOnce([{ name: 'React', total_count: 2n }])
    .mockResolvedValueOnce([]);
  const page = await fetchAnalysisData(7);
  const result = await (
    await analysisGet(
      new NextRequest('http://localhost/api/trends/analysis?days=7')
    )
  ).json();
  delete result.cache;
  expect(result).toEqual(page);
  expect(page.timeline).toHaveLength(8);
  expect(page.timeline.every((day) => day.React === 0)).toBe(true);
  expect(db.$queryRaw).toHaveBeenCalledTimes(2);
});

it('source distribution fills full stats instead of poisoning the API with a partial payload', async () => {
  expect(await fetchSourceData()).toEqual([
    { name: 'S1', value: 20, percentage: 100 },
  ]);
  const result = await statsGet(new NextRequest('http://localhost/api/stats'));
  const data = await result.json();
  expect(data.data.overview.total).toBe(20);
  expect(data.data.daily).toEqual([]);
  expect(data.data.tags).toEqual([]);
  expect(data.data.sources).toHaveLength(1);
  expect(result.headers.get('X-Cache-Status')).toBe('HIT');
  expect(db.article.count).toHaveBeenCalledTimes(3);
  expect(db.source.findMany).toHaveBeenCalledTimes(1);
  expect(db.$queryRaw).toHaveBeenCalledTimes(2);
});

it('ten concurrent new-tag requests execute one DB query; days use independent keys', async () => {
  db.$queryRaw.mockResolvedValue([{ id: 't', name: 'New', count: 3n }]);
  const requests = await Promise.all(
    Array.from({ length: 10 }, () =>
      newTagsGet(new NextRequest('http://localhost/api/tags/new?days=7'))
    )
  );
  const values = await Promise.all(requests.map((response) => response.json()));
  expect(
    values.every((value) => JSON.stringify(value) === JSON.stringify(values[0]))
  ).toBe(true);
  expect(values[0]).toEqual({
    count: 1,
    tags: [{ id: 't', name: 'New', articleCount: 3 }],
  });
  expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  await newTagsGet(new NextRequest('http://localhost/api/tags/new?days=14'));
  expect(db.$queryRaw).toHaveBeenCalledTimes(2);
});

it('search keys use trimmed/truncated q, while distinct queries stay separate', async () => {
  db.$queryRaw.mockResolvedValue([
    { id: 'r', name: 'React', category: null, count: 3n },
  ]);
  const first = await (
    await searchGet(
      new NextRequest('http://localhost/api/tags/search?q=%20React%20')
    )
  ).json();
  expect(
    await (
      await searchGet(
        new NextRequest('http://localhost/api/tags/search?q=React')
      )
    ).json()
  ).toEqual(first);
  expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  await searchGet(new NextRequest('http://localhost/api/tags/search?q=Vue'));
  expect(db.$queryRaw).toHaveBeenCalledTimes(2);
});

it('late lock acquisition rechecks a value filled by the previous owner', async () => {
  const cache = new RedisCache({ namespace: 'race-test' });
  redis.set.mockImplementationOnce(async () => {
    store.set('race-test:key', JSON.stringify({ count: 2 }));
    return 'OK';
  });
  const fetcher = jest.fn();
  expect(await cache.getOrSetWithLock('key', fetcher)).toEqual({ count: 2 });
  expect(fetcher).not.toHaveBeenCalled();
});

it('all shared loaders and tag endpoints still return data with Redis unavailable', async () => {
  redis.get.mockRejectedValue(new Error('Redis unavailable'));
  redis.set.mockRejectedValue(new Error('Redis unavailable'));
  expect(await fetchKeywordsData()).toEqual({ trending: [], newTags: [] });
  expect((await fetchAnalysisData(7)).period.days).toBe(7);
  expect(await fetchSourceData()).toHaveLength(1);
  expect(
    (await newTagsGet(new NextRequest('http://localhost/api/tags/new'))).status
  ).toBe(200);
  expect(
    (await searchGet(new NextRequest('http://localhost/api/tags/search')))
      .status
  ).toBe(200);
});
