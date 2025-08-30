import { NextResponse } from 'next/server';
import { statsCache } from '@/lib/cache/stats-cache';
import { trendsCache } from '@/lib/cache/trends-cache';
import { getRedisClient } from '@/lib/redis/client';

/**
 * キャッシュ統計情報を提供するエンドポイント
 * 各キャッシュのヒット率、ミス率、メモリ使用量などを監視
 */
export async function GET() {
  try {
    // 各キャッシュの統計を取得
    const statsCacheStats = statsCache.getStats();
    const trendsCacheStats = trendsCache.getStats();
    
    // ヒット率を計算
    const calculateHitRate = (stats: { hits: number; misses: number }) => {
      const total = stats.hits + stats.misses;
      if (total === 0) return 0;
      return Math.round((stats.hits / total) * 100);
    };
    
    // Redis情報を取得
    let redisInfo: { memoryUsed?: string; memoryPeak?: string; connected: boolean; error?: string } | null = null;
    try {
      const redis = getRedisClient();
      const info = await redis.info('memory');
      const lines = info.split('\r\n');
      const memoryUsed = lines.find(line => line.startsWith('used_memory_human:'))?.split(':')[1];
      const memoryPeak = lines.find(line => line.startsWith('used_memory_peak_human:'))?.split(':')[1];
      
      redisInfo = {
        memoryUsed,
        memoryPeak,
        connected: true
      };
    } catch {
      redisInfo = {
        connected: false,
        error: 'Failed to connect to Redis'
      };
    }
    
    // レスポンスデータを整形
    const response = {
      timestamp: new Date().toISOString(),
      caches: {
        stats: {
          namespace: '@techtrend/cache:stats',
          hits: statsCacheStats.hits,
          misses: statsCacheStats.misses,
          hitRate: calculateHitRate(statsCacheStats),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          lastResetAt: (statsCacheStats as any).lastResetAt || null
        },
        trends: {
          namespace: '@techtrend/cache:trends',
          hits: trendsCacheStats.hits,
          misses: trendsCacheStats.misses,
          hitRate: calculateHitRate(trendsCacheStats),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          lastResetAt: (trendsCacheStats as any).lastResetAt || null
        }
      },
      overall: {
        totalHits: statsCacheStats.hits + trendsCacheStats.hits,
        totalMisses: statsCacheStats.misses + trendsCacheStats.misses,
        overallHitRate: calculateHitRate({
          hits: statsCacheStats.hits + trendsCacheStats.hits,
          misses: statsCacheStats.misses + trendsCacheStats.misses
        })
      },
      redis: redisInfo,
      recommendations: generateRecommendations({
        statsHitRate: calculateHitRate(statsCacheStats),
        trendsHitRate: calculateHitRate(trendsCacheStats)
      })
    };
    
    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch cache statistics'
      },
      { status: 500 }
    );
  }
}

/**
 * ヒット率に基づく推奨事項を生成
 */
function generateRecommendations(params: {
  statsHitRate: number;
  trendsHitRate: number;
}): string[] {
  const recommendations: string[] = [];
  
  if (params.statsHitRate < 60) {
    recommendations.push('Stats cache hit rate is low. Consider increasing TTL.');
  }
  
  if (params.trendsHitRate < 60) {
    recommendations.push('Trends cache hit rate is low. Consider optimizing cache keys or increasing TTL.');
  }
  
  if (params.statsHitRate > 90) {
    recommendations.push('Stats cache performing well with high hit rate.');
  }
  
  if (params.trendsHitRate > 90) {
    recommendations.push('Trends cache performing well with high hit rate.');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Cache performance is moderate. Monitor for optimization opportunities.');
  }
  
  return recommendations;
}