import { RedisCache } from './redis-cache';
import * as crypto from 'crypto';

/**
 * 記事検索専用のキャッシュクラス
 * /api/articles/search エンドポイントで使用
 */
export class SearchCache extends RedisCache {
  constructor() {
    super({
      ttl: 600, // 10分（デフォルト）
      namespace: '@techtrend/cache:search'
    });
  }

  /**
   * 検索クエリからキャッシュキーを生成
   * クエリパラメータをハッシュ化してキーとして使用
   * @param query 検索クエリパラメータ
   * @returns キャッシュキー
   */
  generateQueryKey(query: {
    q?: string;
    source?: string;
    tag?: string;
    sort?: string;
    order?: string;
    page?: number;
    limit?: number;
    [key: string]: unknown;
  }): string {
    // クエリパラメータをソートして一貫性のあるキーを生成
    const sortedQuery = Object.keys(query)
      .sort()
      .reduce((acc, key) => {
        if (query[key] !== undefined && query[key] !== null && query[key] !== '') {
          acc[key] = query[key];
        }
        return acc;
      }, {} as Record<string, unknown>);
    
    // クエリが空の場合
    if (Object.keys(sortedQuery).length === 0) {
      return 'search:empty';
    }
    
    // クエリ文字列をハッシュ化
    const queryString = JSON.stringify(sortedQuery);
    const hash = crypto.createHash('sha256').update(queryString).digest('hex');
    
    // 可読性のためクエリ文字列の一部を含める（最初の20文字）
    const queryPreview = query.q ? query.q.substring(0, 20) : 'no-query';
    return `search:${queryPreview}:${hash.substring(0, 16)}`;
  }

  /**
   * TTLを動的に調整（5-15分の範囲）
   * @param minutes TTL（分単位）
   */
  setCustomTTL(minutes: number): void {
    const minMinutes = 5;
    const maxMinutes = 15;
    const clampedMinutes = Math.max(minMinutes, Math.min(minutes, maxMinutes));
    this.defaultTTL = clampedMinutes * 60;
  }

  /**
   * 検索結果のキャッシュ統計を取得
   * @returns 検索特有の統計情報
   */
  getSearchStats() {
    const baseStats = this.getStats();
    const hitRate = baseStats.hits + baseStats.misses > 0
      ? (baseStats.hits / (baseStats.hits + baseStats.misses) * 100).toFixed(2)
      : 0;
    
    return {
      ...baseStats,
      hitRate: `${hitRate}%`,
      avgCacheTTL: this.defaultTTL,
      namespace: '@techtrend/cache:search'
    };
  }
}

export const searchCache = new SearchCache();
