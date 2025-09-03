/**
 * /api/cache/health エンドポイントのテスト
 */

// モックインスタンスを保持
let mockRedisClient: any;
let mockCircuitBreaker: any;

jest.mock('@/lib/redis/client', () => ({
  getRedisClient: jest.fn(() => {
    const { createRedisClientMock } = require('../../../helpers/cache-mock-helpers');
    if (!mockRedisClient) {
      mockRedisClient = createRedisClientMock();
    }
    return mockRedisClient;
  })
}));

jest.mock('@/lib/cache/circuit-breaker', () => ({
  redisCircuitBreaker: (() => {
    const { createCircuitBreakerMock } = require('../../../helpers/cache-mock-helpers');
    if (!mockCircuitBreaker) {
      mockCircuitBreaker = createCircuitBreakerMock();
    }
    return mockCircuitBreaker;
  })()
}));

import { GET } from '@/app/api/cache/health/route';
import { getRedisClient } from '@/lib/redis/client';
import { redisCircuitBreaker } from '@/lib/cache/circuit-breaker';

// モックの型定義
const getRedisClientMock = getRedisClient as jest.MockedFunction<typeof getRedisClient>;
const redisCircuitBreakerMock = redisCircuitBreaker as any;

describe('/api/cache/health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // モックの初期化を確実にする
    const { createRedisClientMock, createCircuitBreakerMock } = require('../../../helpers/cache-mock-helpers');
    if (!mockRedisClient) {
      mockRedisClient = createRedisClientMock();
    }
    if (!mockCircuitBreaker) {
      mockCircuitBreaker = createCircuitBreakerMock();
    }
    
    // Redisクライアントのモックをリセット
    mockRedisClient.ping.mockResolvedValue('PONG');
    
    // サーキットブレーカーのモックをリセット
    mockCircuitBreaker.getStats.mockReturnValue({
      state: 'CLOSED',
      failures: 0,
      successes: 100,
      consecutiveFailures: 0,
      lastFailureTime: null,
      nextRetryTime: null
    });
  });

  describe('GET', () => {
    it('正常な状態でヘルスチェックを返す', async () => {
      const response = await GET();

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.status).toBe('healthy');
      expect(data.redis.connected).toBe(true);
      expect(data.redis.responseTime).toBeGreaterThanOrEqual(0);
      expect(data.redis.error).toBeNull();
      expect(data.circuitBreaker.state).toBe('CLOSED');
      expect(data.recommendations).toContain('All systems operational.');
    });

    it('Redis接続エラーの場合degraded状態を返す', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Connection refused'));

      const response = await GET();

      expect(response.status).toBe(503);
      const data = await response.json();
      
      expect(data.status).toBe('degraded');
      expect(data.redis.connected).toBe(false);
      expect(data.redis.responseTime).toBe(-1);
      expect(data.redis.error).toBe('Connection refused');
      expect(data.recommendations).toContain('Redis connection failed. Check Redis server status.');
    });

    it('サーキットブレーカーがOPENの場合degraded状態を返す', async () => {
      redisCircuitBreakerMock.getStats.mockReturnValue({
        state: 'OPEN',
        failures: 10,
        successes: 0,
        consecutiveFailures: 10,
        lastFailureTime: new Date().toISOString(),
        nextRetryTime: new Date(Date.now() + 60000).toISOString()
      });

      const response = await GET();

      expect(response.status).toBe(503);
      const data = await response.json();
      
      expect(data.status).toBe('degraded');
      expect(data.circuitBreaker.state).toBe('OPEN');
      expect(data.recommendations).toContain('Circuit breaker is OPEN. System is in fallback mode.');
    });

    it('サーキットブレーカーがHALF_OPENの場合推奨事項を含む', async () => {
      redisCircuitBreakerMock.getStats.mockReturnValue({
        state: 'HALF_OPEN',
        failures: 5,
        successes: 2,
        consecutiveFailures: 0,
        lastFailureTime: new Date().toISOString(),
        nextRetryTime: null
      });

      const response = await GET();

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.status).toBe('healthy');
      expect(data.circuitBreaker.state).toBe('HALF_OPEN');
      expect(data.recommendations).toContain('Circuit breaker is HALF_OPEN. Testing Redis connection recovery.');
    });

    it('Redisレスポンスタイムが遅い場合推奨事項を含む', async () => {
      // pingの実行時間を遅延させる
      mockRedisClient.ping.mockImplementation(() => {
        return new Promise(resolve => setTimeout(() => resolve('PONG'), 150));
      });

      const response = await GET();

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.status).toBe('healthy');
      expect(data.redis.responseTime).toBeGreaterThan(100);
      expect(data.recommendations.some((r: string) => r.includes('Redis response time is high'))).toBe(true);
    });

    it('複数の問題がある場合すべての推奨事項を含む', async () => {
      // Redis接続エラー
      mockRedisClient.ping.mockRejectedValue(new Error('Connection timeout'));
      
      // サーキットブレーカーOPEN
      redisCircuitBreakerMock.getStats.mockReturnValue({
        state: 'OPEN',
        failures: 15,
        successes: 0,
        consecutiveFailures: 15,
        lastFailureTime: new Date().toISOString(),
        nextRetryTime: new Date(Date.now() + 60000).toISOString()
      });

      const response = await GET();

      expect(response.status).toBe(503);
      const data = await response.json();
      
      expect(data.status).toBe('degraded');
      expect(data.recommendations).toContain('Redis connection failed. Check Redis server status.');
      expect(data.recommendations).toContain('Circuit breaker is OPEN. System is in fallback mode.');
    });

    it('タイムスタンプを含む', async () => {
      const before = new Date().toISOString();
      const response = await GET();
      const after = new Date().toISOString();

      const data = await response.json();
      
      expect(data.timestamp).toBeDefined();
      expect(new Date(data.timestamp).toISOString()).toBeGreaterThanOrEqual(before);
      expect(new Date(data.timestamp).toISOString()).toBeLessThanOrEqual(after);
    });

    it('サーキットブレーカーの詳細統計を含む', async () => {
      const mockStats = {
        state: 'CLOSED',
        failures: 2,
        successes: 98,
        consecutiveFailures: 0,
        lastFailureTime: '2025-01-01T10:00:00.000Z',
        nextRetryTime: null
      };
      
      redisCircuitBreakerMock.getStats.mockReturnValue(mockStats);

      const response = await GET();
      const data = await response.json();
      
      expect(data.circuitBreaker).toEqual(mockStats);
    });

    it('予期しないエラーの場合500を返す', async () => {
      // getRedisClientがエラーを投げる
      (getRedisClient as jest.Mock).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const response = await GET();

      expect(response.status).toBe(500);
      const data = await response.json();
      
      expect(data.status).toBe('error');
      expect(data.error).toBe('Failed to perform health check');
      expect(data.details).toBe('Unexpected error');
    });

    it('Redisエラーでもサーキットブレーカーが正常ならhealthyとする', async () => {
      // Redis接続エラー
      mockRedisClient.ping.mockRejectedValue(new Error('Connection refused'));
      
      // でもサーキットブレーカーはCLOSED（正常）
      redisCircuitBreakerMock.getStats.mockReturnValue({
        state: 'CLOSED',
        failures: 1,
        successes: 99,
        consecutiveFailures: 1,
        lastFailureTime: new Date().toISOString(),
        nextRetryTime: null
      });

      const response = await GET();

      // サーキットブレーカーがCLOSEDなので200を返す
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.status).toBe('healthy');
      expect(data.redis.connected).toBe(false);
      expect(data.circuitBreaker.state).toBe('CLOSED');
    });
  });
});