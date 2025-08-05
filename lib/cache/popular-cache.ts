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
  private cache: RedisCache;

  constructor() {
    this.cache = new RedisCache({
      ttl: 600, // デフォルト10分
      namespace: '@techtrend/cache:popular'
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
    const ttl = CACHE_DURATION[period];
    
    // 一時的にTTLを変更してgetOrSetを実行
    const originalTtl = this.cache['options'].ttl;
    this.cache['options'].ttl = ttl;
    
    try {
      return await this.cache.getOrSet(key, fetcher);
    } finally {
      // TTLを元に戻す
      this.cache['options'].ttl = originalTtl;
    }
  }

  /**
   * 特定期間のキャッシュを無効化
   */
  async invalidatePeriod(period: PopularPeriod): Promise<void> {
    await this.cache.invalidatePattern(`articles:${period}:*`);
  }

  /**
   * すべての人気記事キャッシュを無効化
   */
  async invalidateAll(): Promise<void> {
    await this.cache.invalidatePattern('articles:*');
  }
}

// シングルトンインスタンスをエクスポート
export const popularCache = new PopularCache();