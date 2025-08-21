/**
 * Sources APIテスト
 * MSW依存を排除し、純粋なJestモックを使用
 */

import { testApiHandler, assertSuccessResponse } from '../../helpers/test-utils';
import { GET as getSourcesHandler } from '@/app/api/sources/route';
// import { GET as getStatsHandler } from '@/app/api/sources/stats/route'; // モジュールが存在しない
import prismaMock from '../../../__mocks__/lib/prisma';
// import redisMock from '../../../__mocks__/lib/redis/client'; // モジュールが存在しない

describe('Sources API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // デフォルトのモック設定
    prismaMock.source.findMany.mockResolvedValue([]);
    prismaMock.article.groupBy.mockResolvedValue([]);
    // redisMock.get.mockResolvedValue(null);
    // redisMock.set.mockResolvedValue('OK');
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
          updatedAt: new Date()
        },
        {
          id: 'zenn',
          name: 'Zenn',
          type: 'rss',
          url: 'https://zenn.dev',
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      prismaMock.source.findMany.mockResolvedValue(mockSources);

      const response = await testApiHandler(getSourcesHandler, {
        url: 'http://localhost:3000/api/sources'
      });

      assertSuccessResponse(response);
      expect(response.data.data).toHaveLength(2);
      expect(response.data.data[0].id).toBe('qiita');
      expect(response.data.data[1].id).toBe('zenn');
    });

    it('should only return enabled sources', async () => {
      prismaMock.source.findMany.mockResolvedValue([]);

      await testApiHandler(getSourcesHandler, {
        url: 'http://localhost:3000/api/sources'
      });

      // enabledがtrueの条件で呼ばれていることを確認
      expect(prismaMock.source.findMany).toHaveBeenCalledWith({
        where: { enabled: true },
        orderBy: { name: 'asc' }
      });
    });

    it('should use cache when available', async () => {
      const cachedData = JSON.stringify([
        { id: 'cached', name: 'Cached Source' }
      ]);

      redisMock.get.mockResolvedValueOnce(cachedData);

      const response = await testApiHandler(getSourcesHandler, {
        url: 'http://localhost:3000/api/sources'
      });

      assertSuccessResponse(response);
      expect(response.data.data[0].id).toBe('cached');
      expect(prismaMock.source.findMany).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      prismaMock.source.findMany.mockRejectedValue(new Error('Database error'));

      const response = await testApiHandler(getSourcesHandler, {
        url: 'http://localhost:3000/api/sources'
      });

      expect(response.status).toBe(500);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toBeDefined();
    });
  });

  describe('GET /api/sources/stats', () => {
    it('should return source statistics', async () => {
      const mockStats = [
        {
          sourceId: 'qiita',
          _count: { id: 10 },
          _avg: { qualityScore: 85.5 },
          _max: { publishedAt: new Date('2025-01-01') },
          _min: { publishedAt: new Date('2024-12-01') }
        },
        {
          sourceId: 'zenn',
          _count: { id: 5 },
          _avg: { qualityScore: 82.0 },
          _max: { publishedAt: new Date('2025-01-02') },
          _min: { publishedAt: new Date('2024-11-01') }
        }
      ];

      prismaMock.article.groupBy.mockResolvedValue(mockStats);

      const response = await testApiHandler(getStatsHandler, {
        url: 'http://localhost:3000/api/sources/stats'
      });

      assertSuccessResponse(response);
      expect(response.data.data).toBeDefined();
      expect(response.data.data.sources).toHaveLength(2);
      expect(response.data.data.sources[0].sourceId).toBe('qiita');
      expect(response.data.data.sources[0].articleCount).toBe(10);
      expect(response.data.data.sources[0].avgQualityScore).toBe(85.5);
    });

    it('should calculate aggregate metrics', async () => {
      const mockStats = [
        {
          sourceId: 'source1',
          _count: { id: 10 },
          _avg: { qualityScore: 80 },
          _max: { publishedAt: new Date() },
          _min: { publishedAt: new Date() }
        },
        {
          sourceId: 'source2',
          _count: { id: 20 },
          _avg: { qualityScore: 90 },
          _max: { publishedAt: new Date() },
          _min: { publishedAt: new Date() }
        }
      ];

      prismaMock.article.groupBy.mockResolvedValue(mockStats);

      const response = await testApiHandler(getStatsHandler, {
        url: 'http://localhost:3000/api/sources/stats'
      });

      assertSuccessResponse(response);
      expect(response.data.data.aggregate.totalArticles).toBe(30);
      expect(response.data.data.aggregate.avgQualityScore).toBeCloseTo(86.67, 1);
    });

    it('should use cache when available', async () => {
      const cachedData = JSON.stringify({
        sources: [{ sourceId: 'cached', articleCount: 100 }],
        aggregate: { totalArticles: 100 }
      });

      redisMock.get.mockResolvedValueOnce(cachedData);

      const response = await testApiHandler(getStatsHandler, {
        url: 'http://localhost:3000/api/sources/stats'
      });

      assertSuccessResponse(response);
      expect(response.data.data.sources[0].sourceId).toBe('cached');
      expect(prismaMock.article.groupBy).not.toHaveBeenCalled();
    });

    it('should handle empty statistics', async () => {
      prismaMock.article.groupBy.mockResolvedValue([]);

      const response = await testApiHandler(getStatsHandler, {
        url: 'http://localhost:3000/api/sources/stats'
      });

      assertSuccessResponse(response);
      expect(response.data.data.sources).toHaveLength(0);
      expect(response.data.data.aggregate.totalArticles).toBe(0);
      expect(response.data.data.aggregate.avgQualityScore).toBe(0);
    });

    it('should handle database errors', async () => {
      prismaMock.article.groupBy.mockRejectedValue(new Error('Database error'));

      const response = await testApiHandler(getStatsHandler, {
        url: 'http://localhost:3000/api/sources/stats'
      });

      expect(response.status).toBe(500);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toBeDefined();
    });

    it('should set correct cache TTL', async () => {
      const mockStats = [{
        sourceId: 'test',
        _count: { id: 1 },
        _avg: { qualityScore: 80 },
        _max: { publishedAt: new Date() },
        _min: { publishedAt: new Date() }
      }];

      prismaMock.article.groupBy.mockResolvedValue(mockStats);
      redisMock.get.mockResolvedValue(null);

      await testApiHandler(getStatsHandler, {
        url: 'http://localhost:3000/api/sources/stats'
      });

      // キャッシュが設定されたことを確認（TTL 3600秒）
      expect(redisMock.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'EX',
        3600
      );
    });
  });
});