import { RedisCache } from './index';
import { POPULAR_CACHE_DURATION } from './constants';

export type PopularPeriod = keyof typeof POPULAR_CACHE_DURATION;

export interface PopularCacheOptions {
  limit?: number;
  sourceId?: string;
  tagId?: string;
  metric?: string;
  includeEmptyContent?: boolean;
  excludeUnprocessed?: boolean;
  excludeLowQuality?: boolean;
}

export class PopularCache {
  private caches: Map<PopularPeriod, RedisCache>;

  constructor() {
    // 期間ごとに異なるTTLを持つRedisCacheインスタンスを作成
    this.caches = new Map();

    Object.entries(POPULAR_CACHE_DURATION).forEach(([period, ttl]) => {
      this.caches.set(
        period as PopularPeriod,
        new RedisCache({
          ttl,
          namespace: '@techtrend/cache:popular',
        })
      );
    });
  }

  /**
   * 人気記事のキャッシュキーを生成
   */
  generateKey(period: PopularPeriod, options?: PopularCacheOptions): string {
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

    if (options?.metric) {
      parts.push(`metric:${options.metric}`);
    }

    if (options?.includeEmptyContent) {
      parts.push('emptyContent:1');
    }

    if (options?.excludeUnprocessed) {
      parts.push('exUnprocessed:1');
    }

    if (options?.excludeLowQuality) {
      parts.push('exLowQuality:1');
    }

    return parts.join(':');
  }

  /**
   * 人気記事を取得またはキャッシュ
   */
  async getOrSet<T>(
    period: PopularPeriod,
    fetcher: () => Promise<T>,
    options?: PopularCacheOptions
  ): Promise<T> {
    const key = this.generateKey(period, options);
    const cache = this.caches.get(period);

    if (!cache) {
      throw new Error(`Cache not found for period: ${period}`);
    }

    // 期間に対応するキャッシュインスタンスを使用
    // RedisCache.getOrSetは内部でRedisエラーをswallowするため、
    // ここに到達するエラーはfetcher由来。再実行せずそのまま伝播させる
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
    const promises = Array.from(this.caches.values()).map((cache) =>
      cache.invalidatePattern('articles:*')
    );
    await Promise.all(promises);
  }
}

// シングルトンインスタンスをエクスポート
export const popularCache = new PopularCache();
