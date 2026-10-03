import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis/client';
import { redisCircuitBreaker } from '@/lib/cache/circuit-breaker';
import logger from '@/lib/logger';

// 例外の文言（接続先のホスト・ポートを含みうる）は本番では返さない（issue #687）。原因はログで追う
const exposeErrorDetails = (): boolean => process.env.NODE_ENV !== 'production';

/**
 * キャッシュシステムのヘルスチェックエンドポイント
 * Redis接続状態とサーキットブレーカーの状態を監視
 */
export async function GET() {
  try {
    // Redis接続状態をチェック
    let redisHealth = {
      connected: false,
      responseTime: -1,
      error: null as string | null,
    };

    try {
      const redis = getRedisClient();
      const start = Date.now();
      await redis.ping();
      const responseTime = Date.now() - start;

      redisHealth = {
        connected: true,
        responseTime,
        error: null,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Cache health check: Redis ping failed');
      redisHealth = {
        connected: false,
        responseTime: -1,
        error:
          exposeErrorDetails() && error instanceof Error
            ? error.message
            : 'Redis ping failed',
      };
    }

    // サーキットブレーカーの状態
    const circuitBreakerStats = redisCircuitBreaker.getStats();

    // 全体的なヘルス状態を判定
    const isHealthy =
      redisHealth.connected || circuitBreakerStats.state !== 'OPEN';
    const status = isHealthy ? 'healthy' : 'degraded';

    // 推奨事項を生成
    const recommendations: string[] = [];

    if (!redisHealth.connected) {
      recommendations.push(
        'Redis connection failed. Check Redis server status.'
      );
    }

    if (circuitBreakerStats.state === 'OPEN') {
      recommendations.push(
        'Circuit breaker is OPEN. System is in fallback mode.'
      );
    } else if (circuitBreakerStats.state === 'HALF_OPEN') {
      recommendations.push(
        'Circuit breaker is HALF_OPEN. Testing Redis connection recovery.'
      );
    }

    if (redisHealth.responseTime > 100) {
      recommendations.push(
        `Redis response time is high (${redisHealth.responseTime}ms). Consider optimization.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('All systems operational.');
    }

    const response = {
      status,
      timestamp: new Date().toISOString(),
      redis: redisHealth,
      circuitBreaker: circuitBreakerStats,
      recommendations,
    };

    return NextResponse.json(response, {
      status: isHealthy ? 200 : 503,
    });
  } catch (error) {
    logger.error({ err: error }, 'Cache health check failed');
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Failed to perform health check',
        ...(exposeErrorDetails() && {
          details: error instanceof Error ? error.message : 'Unknown error',
        }),
      },
      { status: 500 }
    );
  }
}
