import { RedisCache } from './redis-cache';

/**
 * 統計情報専用のキャッシュクラス
 * /api/stats エンドポイントで使用
 */
export class StatsCache extends RedisCache {
  constructor() {
    super({
      ttl: 3600, // 1時間（デフォルト）
      namespace: '@techtrend/cache:stats'
    });
  }

  /**
   * 統計データ用のキャッシュキーを生成
   * @returns キャッシュキー
   */
  generateKey(): string {
    return 'overall-stats';
  }

  /**
   * TTLを動的に調整（最大6時間まで）
   * @param hours TTL（時間単位）
   */
  setCustomTTL(hours: number): void {
    const maxHours = 6;
    const ttlInSeconds = Math.min(hours, maxHours) * 3600;
    this.defaultTTL = ttlInSeconds;
  }
}

export const statsCache = new StatsCache();