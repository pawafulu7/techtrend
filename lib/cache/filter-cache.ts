import { RedisCache } from './redis-cache';
import { createHash } from 'crypto';

interface FilterCacheOptions {
  ttl?: number;
  namespace?: string;
}

interface SourceMapping {
  [key: string]: string; // sourceId -> normalized ID
}

interface FilterResult {
  tagIds?: string[];
  sourceIds?: string[];
  normalizedQuery?: any;
}

export class FilterCache {
  private cache: RedisCache;
  private readonly DEFAULT_TTL = 1800; // 30分（ソース情報は変更頻度が低い）

  constructor(options: FilterCacheOptions = {}) {
    this.cache = new RedisCache({
      ttl: options.ttl || this.DEFAULT_TTL,
      namespace: options.namespace || '@techtrend/cache:filters',
    });
  }

  /**
   * フィルター条件からキャッシュキーを生成
   */
  private generateFilterKey(filters: Record<string, any>): string {
    // フィルターを正規化してソート
    const normalized = Object.keys(filters)
      .sort()
      .map(key => `${key}:${JSON.stringify(filters[key])}`)
      .join('|');

    const hash = createHash('sha256').update(normalized).digest('hex');
    return `filter:${hash.substring(0, 16)}`;
  }

  /**
   * ソースID正規化のキャッシュ
   */
  async getSourceMapping(sourceIds: string[]): Promise<SourceMapping | null> {
    if (sourceIds.length === 0) return {};

    const sorted = [...sourceIds].sort();
    const cacheKey = `source:${createHash('sha256')
      .update(sorted.join(','))
      .digest('hex')
      .substring(0, 16)}`;

    return await this.cache.get<SourceMapping>(cacheKey);
  }

  async setSourceMapping(sourceIds: string[], mapping: SourceMapping): Promise<void> {
    if (sourceIds.length === 0) return;

    const sorted = [...sourceIds].sort();
    const cacheKey = `source:${createHash('sha256')
      .update(sorted.join(','))
      .digest('hex')
      .substring(0, 16)}`;

    await this.cache.set(cacheKey, mapping);
  }

  /**
   * フィルター結果のキャッシュ
   */
  async getFilterResult(filters: Record<string, any>): Promise<FilterResult | null> {
    const cacheKey = this.generateFilterKey(filters);
    return await this.cache.get<FilterResult>(cacheKey);
  }

  async setFilterResult(filters: Record<string, any>, result: FilterResult): Promise<void> {
    const cacheKey = this.generateFilterKey(filters);
    await this.cache.set(cacheKey, result);
  }

  /**
   * カテゴリ別ソースリストのキャッシュ
   */
  async getCategorySourceList(category: string): Promise<string[] | null> {
    return await this.cache.get<string[]>(`category:${category}`);
  }

  async setCategorySourceList(category: string, sourceIds: string[]): Promise<void> {
    await this.cache.set(`category:${category}`, sourceIds, 3600); // 1時間キャッシュ
  }

  /**
   * フィルター組み合わせの事前計算結果
   */
  async getPrecomputedFilter(key: string): Promise<any> {
    return await this.cache.get(`precomputed:${key}`);
  }

  async setPrecomputedFilter(key: string, data: any): Promise<void> {
    await this.cache.set(`precomputed:${key}`, data, 600); // 10分キャッシュ
  }

  /**
   * キャッシュの無効化
   */
  async invalidate(type?: 'filter' | 'source' | 'category' | 'precomputed'): Promise<void> {
    switch (type) {
      case 'filter':
        await this.cache.delete('filter:*');
        break;
      case 'source':
        await this.cache.delete('source:*');
        break;
      case 'category':
        await this.cache.delete('category:*');
        break;
      case 'precomputed':
        await this.cache.delete('precomputed:*');
        break;
      default:
        // 全フィルターキャッシュをクリア
        await this.cache.delete('filter:*');
        await this.cache.delete('source:*');
        await this.cache.delete('category:*');
        await this.cache.delete('precomputed:*');
    }
  }

  /**
   * 人気フィルター条件の統計
   */
  async trackFilterUsage(filters: Record<string, any>): Promise<void> {
    const key = this.generateFilterKey(filters);
    const statsKey = `stats:${key}`;

    // 使用回数をインクリメント（実装は簡略化）
    const current = await this.cache.get<number>(statsKey) || 0;
    await this.cache.set(statsKey, current + 1, 86400); // 24時間保持
  }

  async getPopularFilters(limit: number = 10): Promise<Array<{ filter: string; count: number }>> {
    // 実装は省略（Redis SORTEDSETを使用する場合はより効率的）
    return [];
  }

  /**
   * メトリクス取得
   */
  async getMetrics() {
    return {
      namespace: '@techtrend/cache:filters',
      ttl: this.DEFAULT_TTL,
    };
  }
}