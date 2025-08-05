import { RedisCache } from './index';

// 期間別のキャッシュ有効期限（秒）
export const CACHE_DURATION = {
  daily: 600,      // 10分
  weekly: 1800,    // 30分
  monthly: 3600,   // 1時間
  yearly: 86400    // 24時間
} as const;

export type PopularPeriod = keyof typeof CACHE_DURATION;

export class PopularCache {
  private caches: Map<PopularPeriod, RedisCache>;

  constructor() {
    // 期間ごとに異なるTTLを持つRedisCacheインスタンスを作成
    this.caches = new Map();
    
    Object.entries(CACHE_DURATION).forEach(([period, ttl]) => {
      this.caches.set(period as PopularPeriod, new RedisCache({
        ttl,
        namespace: '@techtrend/cache:popular'
      }));
    });
  }

  /**
   * 人気記事のキャッシュキーを生成
   */
  generateKey(period: PopularPeriod, options?: {
    limit?: number;
    sourceId?: string;
    tagId?: string;
  }): string {
    const parts = [`articles:${period}`];
    
    if (options?.limit) {
      parts.push(`limit:${options.limit}`);
    }
    
    if (options?.sourceId) {
      parts.push(`source:${options.sourceId}`);
    }
    
    if (options?.tagId) {
      parts.push(`tag:${options.tagId}`);
    }
    
    return parts.join(':');
  }

  /**
   * 人気記事を取得またはキャッシュ
   */
  async getOrSet<T>(
    period: PopularPeriod,
    fetcher: () => Promise<T>,
    options?: {
      limit?: number;
      sourceId?: string;
      tagId?: string;
    }
  ): Promise<T> {
    const key = this.generateKey(period, options);
    const cache = this.caches.get(period);
    
    if (!cache) {
      throw new Error(`Cache not found for period: ${period}`);
    }
    
    // 期間に対応するキャッシュインスタンスを使用
    return await cache.getOrSet(key, fetcher);
  }

  /**
   * 特定期間のキャッシュを無効化
   */
  async invalidatePeriod(period: PopularPeriod): Promise<void> {
    const cache = this.caches.get(period);
    if (cache) {
      await cache.invalidatePattern(`articles:${period}:*`);
    }
  }

  /**
   * すべての人気記事キャッシュを無効化
   */
  async invalidateAll(): Promise<void> {
    const promises = Array.from(this.caches.values()).map(cache =>
      cache.invalidatePattern('articles:*')
    );
    await Promise.all(promises);
  }
}

// シングルトンインスタンスをエクスポート
export const popularCache = new PopularCache();