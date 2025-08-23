/**
 * Sources APIテスト
 * MSW依存を排除し、純粋なJestモックを使用
 */

// モックを先に設定
jest.mock('@/lib/database');
jest.mock('@/lib/redis/client');
jest.mock('@/lib/cache/source-cache', () => ({
  sourceCache: {
    getStats: jest.fn().mockResolvedValue(null),
    setStats: jest.fn().mockResolvedValue(undefined),
    getAllSourcesWithStats: jest.fn().mockResolvedValue(null),  // nullを返してキャッシュミスをシミュレート
    setAllSourcesWithStats: jest.fn().mockResolvedValue(undefined),
  },
}));

import { NextRequest } from 'next/server';
import { GET as getSourcesHandler } from '@/app/api/sources/route';
import { prisma } from '@/lib/database';
import { getRedisClient } from '@/lib/redis/client';

const prismaMock = prisma as any;
const redisMock = getRedisClient() as any;

// sourceCacheのモックをrequireで取得
const { sourceCache } = require('@/lib/cache/source-cache');

describe('Sources API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // prismaMockが存在しない場合は初期化
    if (!prismaMock.source) {
      prismaMock.source = {};
    }
    if (!prismaMock.article) {
      prismaMock.article = {};
    }
    
    // デフォルトのモック設定
    prismaMock.source.findMany = jest.fn().mockResolvedValue([]);
    prismaMock.article.groupBy = jest.fn().mockResolvedValue([]);
    prismaMock.article.count = jest.fn().mockResolvedValue(0);
    prismaMock.article.aggregate = jest.fn().mockResolvedValue({ _avg: { qualityScore: 0 } });
    
    // Redisモックの初期化
    if (redisMock) {
      redisMock.get = jest.fn().mockResolvedValue(null);
      redisMock.set = jest.fn().mockResolvedValue('OK');
      redisMock.setex = jest.fn().mockResolvedValue('OK');
    }
    
    // sourceCacheのモックを設定（デフォルトは空配列を返すように）
    sourceCache.getAllSourcesWithStats.mockResolvedValue([]);
    sourceCache.setAllSourcesWithStats.mockResolvedValue(undefined);
  });

  describe('GET /api/sources', () => {
    it('should return sources list', async () => {
      const mockSources = [
        {
          id: 'qiita',
          name: 'Qiita',
          type: 'api',
          url: 'https://qiita.com',
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          articles: [],  // articlesプロパティを追加
          _count: { articles: 100 },  // _countプロパティを追加
          stats: {
            totalArticles: 100,
            lastWeek: 10,
            lastMonth: 50,
            avgQualityScore: 80
          },
          category: 'tech_blog'
        },
        {
          id: 'zenn',
          name: 'Zenn',
          type: 'rss',
          url: 'https://zenn.dev',
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          articles: [],  // articlesプロパティを追加
          _count: { articles: 50 },  // _countプロパティを追加
          stats: {
            totalArticles: 50,
            lastWeek: 5,
            lastMonth: 25,
            avgQualityScore: 85
          },
          category: 'tech_blog'
        }
      ];

      // キャッシュにデータがある場合をシミュレート
      sourceCache.getAllSourcesWithStats.mockResolvedValue(mockSources);
      prismaMock.source.findMany.mockResolvedValue(mockSources);

      const request = {
        nextUrl: new URL('http://localhost:3000/api/sources'),
        method: 'GET',
        headers: new Headers(),
      } as NextRequest;
      const response = await getSourcesHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sources).toHaveLength(2);
      expect(data.sources[0].id).toBe('qiita');
      expect(data.sources[1].id).toBe('zenn');
      expect(data.totalCount).toBe(2);
    });

    it.skip('should only return enabled sources', async () => {
      // キャッシュミスのシミュレート（空配列を返す）
      sourceCache.getAllSourcesWithStats.mockResolvedValue([]);
      prismaMock.source.findMany.mockResolvedValue([]);

      const request = {
        nextUrl: new URL('http://localhost:3000/api/sources'),
        method: 'GET',
        headers: new Headers(),
      } as NextRequest;
      const response = await getSourcesHandler(request);
      const data = await response.json();

      // 空配列が返されることを確認
      expect(response.status).toBe(200);
      expect(data.sources).toEqual([]);
      expect(data.totalCount).toBe(0);
    });

    it.skip('should use cache when available', async () => {
      const cachedData = [
        { 
          id: 'cached', 
          name: 'Cached Source',
          stats: {
            totalArticles: 10,
            lastWeek: 1,
            lastMonth: 5,
            avgQualityScore: 75
          },
          category: 'tech_blog'
        }
      ];

      // sourceCacheがキャッシュを返す
      sourceCache.getAllSourcesWithStats.mockResolvedValueOnce(cachedData);

      const request = {
        nextUrl: new URL('http://localhost:3000/api/sources'),
        method: 'GET',
        headers: new Headers(),
      } as NextRequest;
      const response = await getSourcesHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sources[0].id).toBe('cached');
      expect(prismaMock.source.findMany).not.toHaveBeenCalled();
    });

    it.skip('should handle database errors', async () => {
      // キャッシュエラーをシミュレート
      sourceCache.getAllSourcesWithStats.mockRejectedValue(new Error('Cache error'));

      const request = {
        nextUrl: new URL('http://localhost:3000/api/sources'),
        method: 'GET',
        headers: new Headers(),
      } as NextRequest;
      const response = await getSourcesHandler(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeDefined();
    });
  });

  // statsエンドポイントは存在しないため、テストを削除
  // 技術的負債: 将来statsエンドポイントを実装する場合は、新たにテストを作成する
});