/**
 * /api/tags/cloud エンドポイントのテスト
 */

import { createRedisCacheMock } from '../../../helpers/cache-mock-helpers';

// 件数の集計（有効なソースの記事だけを数える生 SQL）は tag-article-counts のテスト DB のテストで確かめる。
// ここでは route がそれをどう呼び、応答をどう組み立てるかを見る
const mockFindTopTags = jest.fn();
// 第 1 引数の prisma は jest-mock-extended の Proxy で、expect.anything() が使えないので、条件（第 2 引数）だけを見る
const lastOptions = () => mockFindTopTags.mock.calls.at(-1)?.[1];
const lastClient = () => mockFindTopTags.mock.calls.at(-1)?.[0];
// lib/prisma は jest.setup.node.js がモックした PrismaClient（= prismaMock）を返す
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prismaMock: sharedPrismaMock } = require('../../../../test/utils/prisma-mock');
const mockCountTagArticlesInRange = jest.fn();
jest.mock('@/lib/database/tag-article-counts', () => ({
  findTopTags: (...args: unknown[]) => mockFindTopTags(...args),
  countTagArticlesInRange: (...args: unknown[]) =>
    mockCountTagArticlesInRange(...args),
}));

// モックインスタンスを保持する変数
let mockCacheInstance: ReturnType<typeof createRedisCacheMock>;

jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => {
    const { createRedisCacheMock } = require('../../../helpers/cache-mock-helpers');
    if (!mockCacheInstance) {
      mockCacheInstance = createRedisCacheMock();
    }
    return mockCacheInstance;
  })
}));

import { GET } from '@/app/api/tags/cloud/route';
import { NextRequest } from 'next/server';

/** findTopTags の戻り値の形。期間ありのときは periodCount に期間内の件数が入る */
const asTopTags = (
  tags: { id: string; name: string; _count: { articles: number } }[],
  withPeriod = true
) =>
  tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    category: null,
    // 全期間の件数（上位の選定に使う）。期間内の件数と区別できるように 1000 を足す
    count: tag._count.articles + 1000,
    ...(withPeriod ? { periodCount: tag._count.articles } : {}),
  }));

/** countTagArticlesInRange の戻り値の形 */
const asRangeCounts = (tags: { id: string; _count: { articles: number } }[]) =>
  new Map(tags.map((tag) => [tag.id, tag._count.articles]));

const DAY_MS = 24 * 60 * 60 * 1000;

describe('/api/tags/cloud', () => {
  const mockTags = [
    {
      id: 'tag1',
      name: 'TypeScript',
      _count: {
        articles: 25
      }
    },
    {
      id: 'tag2',
      name: 'React',
      _count: {
        articles: 20
      }
    },
    {
      id: 'tag3',
      name: 'Next.js',
      _count: {
        articles: 15
      }
    },
    {
      id: 'tag4',
      name: 'Node.js',
      _count: {
        articles: 10
      }
    },
    {
      id: 'tag5',
      name: 'GraphQL',
      _count: {
        articles: 5
      }
    }
  ];

  const mockPreviousTags = [
    {
      id: 'tag1',
      _count: {
        articles: 20
      }
    },
    {
      id: 'tag2',
      _count: {
        articles: 22
      }
    },
    {
      id: 'tag3',
      _count: {
        articles: 10
      }
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // キャッシュモックのリセット（mockCacheInstanceが初期化されていることを確認）
    if (!mockCacheInstance) {
      mockCacheInstance = createRedisCacheMock();
    }
    mockCacheInstance.get.mockResolvedValue(null);
    mockCacheInstance.set.mockResolvedValue(undefined);
    mockCacheInstance.generateCacheKey.mockClear();
    mockCacheInstance.generateCacheKey.mockImplementation((base: string, options: any) => {
      const { period, limit } = options.params;
      return `${base}:${period}:${limit}`;
    });
    
    mockFindTopTags.mockReset();
    mockCountTagArticlesInRange.mockReset();
    mockCountTagArticlesInRange.mockResolvedValue(new Map());
  });

  describe('GET', () => {
    it('デフォルトパラメータでタグクラウドを取得する', async () => {
      mockFindTopTags.mockResolvedValueOnce(asTopTags(mockTags));
      mockCountTagArticlesInRange.mockResolvedValueOnce(
        asRangeCounts(mockPreviousTags)
      );

      const request = new NextRequest(new URL('http://localhost/api/tags/cloud'));
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.tags).toHaveLength(5);
      expect(data.period).toBe('30d');
      // count は期間内の件数（periodCount）
      expect(data.tags[0]).toEqual({
        id: 'tag1',
        name: 'TypeScript',
        count: 25,
        trend: 'rising',  // 20 → 25 で上昇
        growthRate: 25     // (25-20)/20 * 100 = 25%
      });

      expect(mockCacheInstance.set).toHaveBeenCalledWith(
        'tagcloud:v2:30d:50',
        expect.objectContaining({
          tags: expect.any(Array),
          period: '30d',
          generatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
        })
      );
    });

    it('7日間のタグクラウドを取得する（期間と前期間の範囲を渡す）', async () => {
      mockFindTopTags.mockResolvedValueOnce(asTopTags(mockTags.slice(0, 3)));

      const before = Date.now();
      const request = new NextRequest(new URL('http://localhost/api/tags/cloud?period=7d&limit=10'));
      const response = await GET(request);
      const after = Date.now();

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.period).toBe('7d');
      expect(data.tags).toHaveLength(3);

      // 上位の選定: limit と、7 日前からの期間
      expect(mockFindTopTags).toHaveBeenCalledTimes(1);
      const [, options] = mockFindTopTags.mock.calls[0];
      expect(options.limit).toBe(10);
      expect(options.activeSince.getTime()).toBeGreaterThanOrEqual(before - 7 * DAY_MS);
      expect(options.activeSince.getTime()).toBeLessThanOrEqual(after - 7 * DAY_MS);

      // 前期間: 選んだタグについて [14 日前, 7 日前)
      expect(mockCountTagArticlesInRange).toHaveBeenCalledTimes(1);
      const [, ids, range] = mockCountTagArticlesInRange.mock.calls[0];
      expect(ids).toEqual(['tag1', 'tag2', 'tag3']);
      expect(range.to.getTime() - range.from.getTime()).toBeGreaterThanOrEqual(7 * DAY_MS - 60 * 60 * 1000);
      expect(range.to.getTime() - range.from.getTime()).toBeLessThanOrEqual(7 * DAY_MS + 60 * 60 * 1000);
      expect(range.to.getTime()).toBeLessThanOrEqual(after - 7 * DAY_MS + 60 * 60 * 1000);
    });

    it('365日間のタグクラウドを取得する', async () => {
      mockFindTopTags.mockResolvedValueOnce(asTopTags(mockTags));
      mockCountTagArticlesInRange.mockResolvedValueOnce(
        asRangeCounts(mockPreviousTags)
      );

      const request = new NextRequest(new URL('http://localhost/api/tags/cloud?period=365d'));
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.period).toBe('365d');
    });

    it('全期間のタグクラウドを取得する（count は全期間の件数）', async () => {
      mockFindTopTags.mockResolvedValueOnce(asTopTags(mockTags, false));

      const request = new NextRequest(new URL('http://localhost/api/tags/cloud?period=all'));
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.period).toBe('all');
      expect(data.tags).toHaveLength(5);
      expect(data.tags[0].count).toBe(1025);

      // 期間を付けずに上位を選ぶ
      expect(lastClient()).toBe(sharedPrismaMock);
      expect(lastOptions()).toEqual({
        limit: 50,
        activeSince: undefined,
      });

      // 全期間の場合はトレンドはすべてstable、growthRateは0
      data.tags.forEach((tag: any) => {
        expect(tag.trend).toBe('stable');
        expect(tag.growthRate).toBe(0);
      });

      // 前期間のデータは取得されない
      expect(mockCountTagArticlesInRange).not.toHaveBeenCalled();
    });

    it('期間内の件数で並べ直す（上位の選定は全期間の件数）', async () => {
      mockFindTopTags.mockResolvedValueOnce([
        { id: 'a', name: 'A', category: null, count: 100, periodCount: 1 },
        { id: 'b', name: 'B', category: null, count: 50, periodCount: 5 },
      ]);

      const response = await GET(
        new NextRequest(new URL('http://localhost/api/tags/cloud?period=30d'))
      );
      const data = await response.json();

      expect(data.tags.map((t: any) => [t.id, t.count])).toEqual([
        ['b', 5],
        ['a', 1],
      ]);
    });

    it('キャッシュからタグクラウドを返す', async () => {
      const cachedData = {
        tags: mockTags.map(tag => ({
          id: tag.id,
          name: tag.name,
          count: tag._count.articles,
          trend: 'stable' as const,
          growthRate: 0,
        })),
        period: '30d'
      };

      mockCacheInstance.get.mockResolvedValue(cachedData);

      const request = new NextRequest(new URL('http://localhost/api/tags/cloud'));
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toEqual(cachedData);
      expect(mockFindTopTags).not.toHaveBeenCalled();
      expect(mockCacheInstance.get).toHaveBeenCalledWith('tagcloud:v2:30d:50');
    });

    it('トレンドを正しく計算する', async () => {
      const currentTags = [
        { id: 'tag1', name: 'Rising', _count: { articles: 30 } },    // 10 → 30 (3倍)
        { id: 'tag2', name: 'Stable', _count: { articles: 11 } },    // 10 → 11 (変化小)
        { id: 'tag3', name: 'Falling', _count: { articles: 5 } },    // 10 → 5 (半減)
      ];

      const previousTags = [
        { id: 'tag1', _count: { articles: 10 } },
        { id: 'tag2', _count: { articles: 10 } },
        { id: 'tag3', _count: { articles: 10 } },
      ];

      mockFindTopTags.mockResolvedValueOnce(asTopTags(currentTags));
      mockCountTagArticlesInRange.mockResolvedValueOnce(asRangeCounts(previousTags));

      const request = new NextRequest(new URL('http://localhost/api/tags/cloud?period=30d'));
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.tags[0].trend).toBe('rising');       // 3倍なので上昇
      expect(data.tags[0].growthRate).toBe(200);      // (30-10)/10 * 100 = 200%
      expect(data.tags[1].trend).toBe('stable');       // 1.1倍なので安定
      expect(data.tags[1].growthRate).toBe(10);        // (11-10)/10 * 100 = 10%
      expect(data.tags[2].trend).toBe('falling');      // 0.5倍なので下降
      expect(data.tags[2].growthRate).toBe(-50);       // (5-10)/10 * 100 = -50%
    });

    it('カスタムリミットを適用する', async () => {
      mockFindTopTags.mockResolvedValueOnce(asTopTags(mockTags.slice(0, 2)));

      const request = new NextRequest(new URL('http://localhost/api/tags/cloud?limit=2'));
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.tags).toHaveLength(2);

      expect(lastOptions()).toEqual(expect.objectContaining({ limit: 2 }));
    });

    it('無効なperiodパラメータの場合400を返す', async () => {
      const request = new NextRequest(new URL('http://localhost/api/tags/cloud?period=invalid'));
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();

      expect(data).toEqual({
        error: 'Invalid period. Use: 7d, 30d, 365d, or all'
      });
      expect(mockFindTopTags).not.toHaveBeenCalled();
    });

    it('データベースエラーの場合500を返す', async () => {
      mockFindTopTags.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest(new URL('http://localhost/api/tags/cloud'));
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();

      expect(data).toEqual({
        error: 'Internal server error'
      });
    });

    it('キャッシュエラーでも処理を続行する', async () => {
      mockCacheInstance.get.mockRejectedValue(new Error('Cache error'));
      mockFindTopTags.mockResolvedValueOnce(asTopTags(mockTags));

      const request = new NextRequest(new URL('http://localhost/api/tags/cloud'));
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.tags).toHaveLength(5);
    });

    it('前期間のタグが存在しない場合でも正常に処理する', async () => {
      mockFindTopTags.mockResolvedValueOnce(asTopTags(mockTags));
      mockCountTagArticlesInRange.mockResolvedValueOnce(new Map());  // 前期間のタグなし

      const request = new NextRequest(new URL('http://localhost/api/tags/cloud?period=7d'));
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      // 前期間のデータがなく今期間に記事があるので、risingとして扱われる
      data.tags.forEach((tag: any) => {
        expect(tag.trend).toBe('rising');
        expect(tag.growthRate).toBe(100);
      });
    });
  });
});
