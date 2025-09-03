/**
 * /api/tags/cloud エンドポイントのテスト
 */

import { createRedisCacheMock } from '../../../helpers/cache-mock-helpers';

// モックの設定
jest.mock('@/lib/database');

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
import { prisma } from '@/lib/database';
import { RedisCache } from '@/lib/cache';
import { NextRequest } from 'next/server';

// モックの型定義
const prismaMock = prisma as any;
const RedisCacheMock = RedisCache as jest.MockedClass<typeof RedisCache>;

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
    
    // Prismaモックの設定
    prismaMock.tag = {
      findMany: jest.fn()
    };
  });

  describe('GET', () => {
    it('デフォルトパラメータでタグクラウドを取得する', async () => {
      prismaMock.tag.findMany
        .mockResolvedValueOnce(mockTags)  // 現在期間のタグ
        .mockResolvedValueOnce(mockPreviousTags);  // 前期間のタグ

      const request = new NextRequest('http://localhost/api/tags/cloud');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.tags).toHaveLength(5);
      expect(data.period).toBe('30d');
      expect(data.tags[0]).toEqual({
        id: 'tag1',
        name: 'TypeScript',
        count: 25,
        trend: 'rising'  // 20 → 25 で上昇
      });
      
      expect(mockCacheInstance.set).toHaveBeenCalledWith(
        'tagcloud:30d:50',
        expect.objectContaining({
          tags: expect.any(Array),
          period: '30d'
        })
      );
    });

    it('7日間のタグクラウドを取得する', async () => {
      prismaMock.tag.findMany
        .mockResolvedValueOnce(mockTags.slice(0, 3))
        .mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost/api/tags/cloud?period=7d&limit=10');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.period).toBe('7d');
      expect(data.tags).toHaveLength(3);
      
      // 7日間の期間フィルタが適用されているか確認
      expect(prismaMock.tag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            articles: expect.objectContaining({
              some: expect.objectContaining({
                publishedAt: expect.objectContaining({
                  gte: expect.any(Date)
                })
              })
            })
          }),
          take: 10
        })
      );
    });

    it('365日間のタグクラウドを取得する', async () => {
      prismaMock.tag.findMany
        .mockResolvedValueOnce(mockTags)
        .mockResolvedValueOnce(mockPreviousTags);

      const request = new NextRequest('http://localhost/api/tags/cloud?period=365d');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.period).toBe('365d');
    });

    it('全期間のタグクラウドを取得する', async () => {
      prismaMock.tag.findMany.mockResolvedValueOnce(mockTags);

      const request = new NextRequest('http://localhost/api/tags/cloud?period=all');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.period).toBe('all');
      expect(data.tags).toHaveLength(5);
      
      // 全期間の場合はトレンドはすべてstable
      data.tags.forEach((tag: any) => {
        expect(tag.trend).toBe('stable');
      });
      
      // 前期間のデータは取得されない
      expect(prismaMock.tag.findMany).toHaveBeenCalledTimes(1);
    });

    it('キャッシュからタグクラウドを返す', async () => {
      const cachedData = {
        tags: mockTags.map(tag => ({
          id: tag.id,
          name: tag.name,
          count: tag._count.articles,
          trend: 'stable'
        })),
        period: '30d'
      };
      
      mockCacheInstance.get.mockResolvedValue(cachedData);

      const request = new NextRequest('http://localhost/api/tags/cloud');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toEqual(cachedData);
      expect(prismaMock.tag.findMany).not.toHaveBeenCalled();
      expect(mockCacheInstance.get).toHaveBeenCalledWith('tagcloud:30d:50');
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

      prismaMock.tag.findMany
        .mockResolvedValueOnce(currentTags)
        .mockResolvedValueOnce(previousTags);

      const request = new NextRequest('http://localhost/api/tags/cloud?period=30d');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.tags[0].trend).toBe('rising');   // 3倍なので上昇
      expect(data.tags[1].trend).toBe('stable');   // 1.1倍なので安定
      expect(data.tags[2].trend).toBe('falling');  // 0.5倍なので下降
    });

    it('カスタムリミットを適用する', async () => {
      prismaMock.tag.findMany
        .mockResolvedValueOnce(mockTags.slice(0, 2))
        .mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost/api/tags/cloud?limit=2');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.tags).toHaveLength(2);
      
      expect(prismaMock.tag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 2
        })
      );
    });

    it('データベースエラーの場合500を返す', async () => {
      prismaMock.tag.findMany.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/tags/cloud');
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      
      expect(data).toEqual({
        error: 'Internal server error'
      });
    });

    it('キャッシュエラーでも処理を続行する', async () => {
      mockCacheInstance.get.mockRejectedValue(new Error('Cache error'));
      prismaMock.tag.findMany
        .mockResolvedValueOnce(mockTags)
        .mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost/api/tags/cloud');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.tags).toHaveLength(5);
    });

    it('前期間のタグが存在しない場合でも正常に処理する', async () => {
      prismaMock.tag.findMany
        .mockResolvedValueOnce(mockTags)
        .mockResolvedValueOnce([]);  // 前期間のタグなし

      const request = new NextRequest('http://localhost/api/tags/cloud?period=7d');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      // 前期間のデータがないので、すべてstableとして扱われる
      data.tags.forEach((tag: any) => {
        expect(tag.trend).toBe('stable');
      });
    });
  });
});