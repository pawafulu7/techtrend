import { GET as GET_STATS } from '@/app/api/cache/stats/route';
import { GET as GET_HEALTH } from '@/app/api/cache/health/route';
import { POST as POST_OPTIMIZE } from '@/app/api/cache/optimize/route';
import {
  testApiHandler,
  createMockRedisClient,
  expectApiSuccess,
  expectApiError,
} from './test-utils';

// Redisクライアントのモック
const mockRedis = createMockRedisClient();
jest.mock('@/lib/redis', () => ({
  __esModule: true,
  default: mockRedis,
  getRedisClient: () => mockRedis,
}));

describe('Cache API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Redisストアをクリア
    mockRedis.flushdb();
  });

  describe('GET /api/cache/stats', () => {
    it('キャッシュ統計情報を取得できる', async () => {
      // テストデータをキャッシュに設定
      await mockRedis.set('cache:articles:page1', JSON.stringify({ data: 'test' }));
      await mockRedis.set('cache:articles:page2', JSON.stringify({ data: 'test2' }));
      await mockRedis.set('cache:sources:all', JSON.stringify({ sources: [] }));
      
      mockRedis.keys.mockResolvedValue([
        'cache:articles:page1',
        'cache:articles:page2',
        'cache:sources:all',
      ]);

      const response = await testApiHandler(GET_STATS, {
        url: 'http://localhost:3000/api/cache/stats',
      });

      expectApiSuccess(response);
      expect(response.body).toHaveProperty('stats');
      expect(response.body.stats).toHaveProperty('totalKeys');
      expect(response.body.stats.totalKeys).toBe(3);
    });

    it('パターン別のキャッシュ統計を取得できる', async () => {
      await mockRedis.set('cache:articles:1', 'data1');
      await mockRedis.set('cache:articles:2', 'data2');
      await mockRedis.set('cache:sources:1', 'data3');
      
      mockRedis.keys.mockImplementation(async (pattern: string) => {
        if (pattern.includes('articles')) {
          return ['cache:articles:1', 'cache:articles:2'];
        }
        if (pattern.includes('sources')) {
          return ['cache:sources:1'];
        }
        return [];
      });

      const response = await testApiHandler(GET_STATS, {
        url: 'http://localhost:3000/api/cache/stats',
        searchParams: {
          pattern: 'articles',
        },
      });

      expectApiSuccess(response);
      expect(response.body.stats.pattern).toBe('articles');
      expect(response.body.stats.matchingKeys).toBe(2);
    });

    it('メモリ使用量情報を含む', async () => {
      await mockRedis.set('test:key', 'x'.repeat(1000));
      mockRedis.keys.mockResolvedValue(['test:key']);

      const response = await testApiHandler(GET_STATS, {
        url: 'http://localhost:3000/api/cache/stats',
      });

      expectApiSuccess(response);
      expect(response.body.stats).toHaveProperty('memoryUsage');
      expect(response.body.stats.memoryUsage).toBeGreaterThan(0);
    });

    it('エラー時に適切なレスポンスを返す', async () => {
      mockRedis.keys.mockRejectedValue(new Error('Redis connection failed'));

      const response = await testApiHandler(GET_STATS, {
        url: 'http://localhost:3000/api/cache/stats',
      });

      expectApiError(response, 500);
    });
  });

  describe('GET /api/cache/health', () => {
    it('Redisが正常な場合healthyステータスを返す', async () => {
      // ping相当の操作をモック
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue('test');

      const response = await testApiHandler(GET_HEALTH, {
        url: 'http://localhost:3000/api/cache/health',
      });

      expectApiSuccess(response);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('redis', true);
    });

    it('詳細情報を含むヘルスチェック', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.keys.mockResolvedValue(['key1', 'key2']);

      const response = await testApiHandler(GET_HEALTH, {
        url: 'http://localhost:3000/api/cache/health',
        searchParams: {
          detailed: 'true',
        },
      });

      expectApiSuccess(response);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('details');
      expect(response.body.details).toHaveProperty('cacheKeys', 2);
    });

    it('Redisエラー時にunhealthyステータスを返す', async () => {
      mockRedis.set.mockRejectedValue(new Error('Connection refused'));

      const response = await testApiHandler(GET_HEALTH, {
        url: 'http://localhost:3000/api/cache/health',
      });

      // ヘルスチェックは503を返すべき
      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('status', 'unhealthy');
      expect(response.body).toHaveProperty('redis', false);
    });

    it('レスポンスタイムを測定する', async () => {
      mockRedis.set.mockResolvedValue('OK');
      
      const response = await testApiHandler(GET_HEALTH, {
        url: 'http://localhost:3000/api/cache/health',
      });

      expectApiSuccess(response);
      expect(response.body).toHaveProperty('responseTime');
      expect(typeof response.body.responseTime).toBe('number');
      expect(response.body.responseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('POST /api/cache/optimize', () => {
    it('キャッシュの最適化を実行できる', async () => {
      // 期限切れキャッシュのシミュレーション
      await mockRedis.set('cache:expired:1', 'data');
      await mockRedis.set('cache:valid:1', 'data');
      
      mockRedis.ttl.mockImplementation(async (key: string) => {
        if (key.includes('expired')) return -1; // 期限切れ
        return 3600; // 有効
      });
      
      mockRedis.keys.mockResolvedValue(['cache:expired:1', 'cache:valid:1']);

      const response = await testApiHandler(POST_OPTIMIZE, {
        method: 'POST',
        url: 'http://localhost:3000/api/cache/optimize',
      });

      expectApiSuccess(response);
      expect(response.body).toHaveProperty('optimized', true);
      expect(response.body).toHaveProperty('removed');
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('特定パターンのキャッシュのみ最適化できる', async () => {
      await mockRedis.set('cache:articles:old', 'data');
      await mockRedis.set('cache:sources:keep', 'data');
      
      mockRedis.keys.mockImplementation(async (pattern: string) => {
        if (pattern.includes('articles')) {
          return ['cache:articles:old'];
        }
        return [];
      });

      const response = await testApiHandler(POST_OPTIMIZE, {
        method: 'POST',
        url: 'http://localhost:3000/api/cache/optimize',
        body: {
          pattern: 'articles',
        },
      });

      expectApiSuccess(response);
      expect(mockRedis.keys).toHaveBeenCalledWith(expect.stringContaining('articles'));
    });

    it('強制クリアオプションが機能する', async () => {
      await mockRedis.set('cache:keep:1', 'data');
      await mockRedis.set('cache:keep:2', 'data');
      
      mockRedis.keys.mockResolvedValue(['cache:keep:1', 'cache:keep:2']);

      const response = await testApiHandler(POST_OPTIMIZE, {
        method: 'POST',
        url: 'http://localhost:3000/api/cache/optimize',
        body: {
          forceClear: true,
        },
      });

      expectApiSuccess(response);
      expect(response.body.optimized).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledTimes(2);
    });

    it('ドライランモードで実際の削除を行わない', async () => {
      await mockRedis.set('cache:test:1', 'data');
      mockRedis.keys.mockResolvedValue(['cache:test:1']);
      mockRedis.ttl.mockResolvedValue(-1);

      const response = await testApiHandler(POST_OPTIMIZE, {
        method: 'POST',
        url: 'http://localhost:3000/api/cache/optimize',
        body: {
          dryRun: true,
        },
      });

      expectApiSuccess(response);
      expect(response.body).toHaveProperty('dryRun', true);
      expect(response.body).toHaveProperty('wouldRemove');
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('最適化後の統計情報を返す', async () => {
      await mockRedis.set('cache:old:1', 'data');
      await mockRedis.set('cache:old:2', 'data');
      await mockRedis.set('cache:keep:1', 'data');
      
      mockRedis.keys.mockResolvedValue(['cache:old:1', 'cache:old:2', 'cache:keep:1']);
      mockRedis.ttl.mockImplementation(async (key: string) => {
        return key.includes('old') ? -1 : 3600;
      });

      const response = await testApiHandler(POST_OPTIMIZE, {
        method: 'POST',
        url: 'http://localhost:3000/api/cache/optimize',
      });

      expectApiSuccess(response);
      expect(response.body).toHaveProperty('statistics');
      expect(response.body.statistics).toHaveProperty('totalKeys', 3);
      expect(response.body.statistics).toHaveProperty('removed', 2);
      expect(response.body.statistics).toHaveProperty('remaining', 1);
    });

    it('エラー時に適切なレスポンスを返す', async () => {
      mockRedis.keys.mockRejectedValue(new Error('Redis error'));

      const response = await testApiHandler(POST_OPTIMIZE, {
        method: 'POST',
        url: 'http://localhost:3000/api/cache/optimize',
      });

      expectApiError(response, 500);
    });
  });
});