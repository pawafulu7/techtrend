import { RedisCache } from './redis-cache';
import crypto from 'crypto';

/**
 * トレンド分析専用のキャッシュクラス
 * /api/trends/analysis エンドポイントで使用
 */
export class TrendsCache extends RedisCache {
  constructor() {
    super({
      ttl: 1800, // 30分（デフォルト）
      namespace: '@techtrend/cache:trends'
    });
  }

  /**
   * トレンド分析データ用のキャッシュキーを生成
   * @param params クエリパラメータ
   * @returns キャッシュキー
   */
  generateKey(params: { days?: number; tag?: string }): string {
    const { days = 30, tag = '' } = params;
    return `analysis:days_${days}:tag_${tag || 'all'}`;
  }

  /**
   * 検索クエリ用のハッシュキーを生成
   * より複雑なクエリパラメータに対応
   * @param query クエリオブジェクト
   * @returns ハッシュ化されたキー
   */
  generateHashKey(query: Record<string, any>): string {
    const sortedQuery = Object.keys(query)
      .sort()
      .reduce((acc, key) => {
        acc[key] = query[key];
        return acc;
      }, {} as Record<string, any>);
    
    const queryString = JSON.stringify(sortedQuery);
    const hash = crypto.createHash('sha256').update(queryString).digest('hex');
    return `query:${hash.substring(0, 16)}`;
  }

  /**
   * TTLを動的に調整（最大1時間まで）
   * @param minutes TTL（分単位）
   */
  setCustomTTL(minutes: number): void {
    const maxMinutes = 60;
    const ttlInSeconds = Math.min(minutes, maxMinutes) * 60;
    this.defaultTTL = ttlInSeconds;
  }
}

export const trendsCache = new TrendsCache();