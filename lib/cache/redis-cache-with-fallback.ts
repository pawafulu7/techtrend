import { RedisCache } from './redis-cache';
import { redisCircuitBreaker } from './circuit-breaker';

/**
 * サーキットブレーカーとフォールバック機能を持つRedisCache拡張
 */
export class RedisCacheWithFallback extends RedisCache {
  private memoryCache = new Map<string, { data: unknown; expires: number }>();
  
  /**
   * getOrSetのフォールバック対応版
   * Redis障害時はメモリキャッシュまたは直接データ取得にフォールバック
   */
  async getOrSetWithFallback<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    return redisCircuitBreaker.execute(
      // 通常のRedis操作
      async () => {
        return await this.getOrSet(key, fetcher, ttl);
      },
      // フォールバック処理
      async () => {
        
        // メモリキャッシュをチェック
        const cached = this.memoryCache.get(key);
        if (cached && cached.expires > Date.now()) {
          return cached.data as T;
        }
        
        // データを直接取得
        const data = await fetcher();
        
        // メモリキャッシュに保存（TTLは短めに設定）
        const memoryTTL = Math.min((ttl || this.defaultTTL) * 1000, 60000); // 最大1分
        this.memoryCache.set(key, {
          data,
          expires: Date.now() + memoryTTL
        });
        
        // 古いエントリをクリーンアップ
        this.cleanupMemoryCache();
        
        return data;
      }
    );
  }

  /**
   * メモリキャッシュのクリーンアップ
   */
  private cleanupMemoryCache() {
    const now = Date.now();
    for (const [key, value] of this.memoryCache.entries()) {
      if (value.expires < now) {
        this.memoryCache.delete(key);
      }
    }
    
    // メモリ使用量を制限（最大100エントリ）
    if (this.memoryCache.size > 100) {
      const entriesToDelete = this.memoryCache.size - 100;
      const keys = Array.from(this.memoryCache.keys());
      for (let i = 0; i < entriesToDelete; i++) {
        this.memoryCache.delete(keys[i]);
      }
    }
  }

  /**
   * メモリキャッシュの統計情報
   */
  getMemoryCacheStats() {
    return {
      size: this.memoryCache.size,
      entries: Array.from(this.memoryCache.entries()).map(([key, value]) => ({
        key,
        expires: new Date(value.expires).toISOString()
      }))
    };
  }

  /**
   * メモリキャッシュをクリア
   */
  clearMemoryCache() {
    this.memoryCache.clear();
  }
}
