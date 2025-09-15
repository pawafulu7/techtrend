import { RedisCache } from './index';
import type { PaginatedResponse } from '@/lib/types/api';
import type { ArticleWithRelations } from '@/types/models';
import logger from '@/lib/logger';

/**
 * 記事クエリパラメータの型定義
 */
export interface ArticleQueryParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  sources?: string;
  sourceId?: string;
  tag?: string;
  tags?: string;
  tagMode?: string;
  search?: string;
  dateRange?: string;
  readFilter?: string;
  userId?: string;
  category?: string;
  includeRelations?: boolean;
  includeEmptyContent?: boolean;
  lightweight?: boolean;
  fields?: string;
  includeUserData?: boolean;
  returning?: string;
}

/**
 * 3層キャッシュアーキテクチャを実装するクラス
 * L1: パブリックキャッシュ（基本的な記事リスト）
 * L2: ユーザーキャッシュ（お気に入り、既読状態）
 * L3: 検索キャッシュ（検索結果）
 */
export class LayeredCache {
  private l1Cache: RedisCache;  // パブリックキャッシュ
  private l2Cache: RedisCache;  // ユーザーキャッシュ
  private l3Cache: RedisCache;  // 検索キャッシュ

  constructor() {
    // L1: パブリックキャッシュ（TTL: 1時間）
    this.l1Cache = new RedisCache({
      ttl: 3600, // 1時間
      namespace: '@techtrend/cache:l1:public'
    });

    // L2: ユーザーキャッシュ（TTL: 15分）- ユーザーフィードバックに基づき5分から15分に延長
    this.l2Cache = new RedisCache({
      ttl: 900, // 15分（ユーザーセッション中は維持）
      namespace: '@techtrend/cache:l2:user'
    });

    // L3: 検索キャッシュ（TTL: 10分）- ユーザーフィードバックに基づき1分から10分に延長
    this.l3Cache = new RedisCache({
      ttl: 600, // 10分（検索→詳細→戻るの操作を考慮）
      namespace: '@techtrend/cache:l3:search'
    });
  }

  /**
   * 記事データを取得（キャッシュから、またはfetcherを使用）
   */
  async getArticles<T = PaginatedResponse<ArticleWithRelations>>(
    params: ArticleQueryParams,
    fetcher?: () => Promise<T>
  ): Promise<T | null> {
    const cacheKey = this.getCacheKey(params);

    // L1: 基本的なクエリ（検索、ユーザー固有フィルターなし）
    if (this.isBasicQuery(params)) {
      logger.debug({ cacheKey, layer: 'L1' }, 'Checking L1 cache');

      if (fetcher) {
        return await this.l1Cache.getOrSet(cacheKey.key, fetcher);
      }
      return await this.l1Cache.get(cacheKey.key);
    }

    // L2: ユーザー固有のクエリ
    if (this.isUserQuery(params)) {
      logger.debug({ cacheKey, layer: 'L2', userId: params.userId }, 'Checking L2 cache');

      if (fetcher) {
        return await this.l2Cache.getOrSet(cacheKey.key, fetcher);
      }
      return await this.l2Cache.get(cacheKey.key);
    }

    // L3: 検索クエリ
    if (this.isSearchQuery(params)) {
      logger.debug({ cacheKey, layer: 'L3', search: params.search }, 'Checking L3 cache');

      if (fetcher) {
        return await this.l3Cache.getOrSet(cacheKey.key, fetcher);
      }
      return await this.l3Cache.get(cacheKey.key);
    }

    // どのレイヤーにも該当しない場合は、キャッシュを使用しない
    logger.debug({ params }, 'Query does not match any cache layer');
    return fetcher ? await fetcher() : null;
  }

  /**
   * 記事データをキャッシュに保存
   */
  async setArticles<T>(params: ArticleQueryParams, data: T): Promise<void> {
    const cacheKey = this.getCacheKey(params);

    if (this.isBasicQuery(params)) {
      await this.l1Cache.set(cacheKey.key, data);
    } else if (this.isUserQuery(params)) {
      await this.l2Cache.set(cacheKey.key, data);
    } else if (this.isSearchQuery(params)) {
      await this.l3Cache.set(cacheKey.key, data);
    }
  }

  /**
   * 基本的なクエリかどうかを判定
   * 検索、ユーザー固有フィルター、タグフィルターがない場合
   */
  private isBasicQuery(params: ArticleQueryParams): boolean {
    return !params.search &&
           !params.readFilter &&
           !params.userId &&
           !params.tags &&
           !params.tag;
  }

  /**
   * ユーザー固有のクエリかどうかを判定
   */
  private isUserQuery(params: ArticleQueryParams): boolean {
    return !params.search &&
           params.userId !== undefined &&
           (params.readFilter === 'read' || params.readFilter === 'unread');
  }

  /**
   * 検索クエリかどうかを判定
   */
  private isSearchQuery(params: ArticleQueryParams): boolean {
    return params.search !== undefined && params.search !== '';
  }

  /**
   * キャッシュキーを生成
   */
  private getCacheKey(params: ArticleQueryParams): { key: string; layer: 'L1' | 'L2' | 'L3' | 'none' } {
    // 基本クエリのキー（簡素化されたパラメータ）
    if (this.isBasicQuery(params)) {
      const key = this.generateBasicKey(params);
      return { key, layer: 'L1' };
    }

    // ユーザークエリのキー
    if (this.isUserQuery(params)) {
      const key = this.generateUserKey(params);
      return { key, layer: 'L2' };
    }

    // 検索クエリのキー
    if (this.isSearchQuery(params)) {
      const key = this.generateSearchKey(params);
      return { key, layer: 'L3' };
    }

    return { key: '', layer: 'none' };
  }

  /**
   * 基本クエリ用のキーを生成（簡素化）
   */
  private generateBasicKey(params: ArticleQueryParams): string {
    // 基本的なパラメータのみを使用（4個のパラメータ）
    const basicParams = {
      page: params.page || 1,
      limit: params.limit || 20,
      sortBy: params.sortBy || 'publishedAt',
      category: params.category || 'all'
    };

    // パラメータをソートして一貫性を保つ
    const sortedParams = Object.entries(basicParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(':');

    return `articles:basic:${sortedParams}`;
  }

  /**
   * ユーザークエリ用のキーを生成
   */
  private generateUserKey(params: ArticleQueryParams): string {
    const userParams = {
      userId: params.userId,
      readFilter: params.readFilter || 'all',
      page: params.page || 1,
      limit: params.limit || 20,
      sortBy: params.sortBy || 'publishedAt'
    };

    const sortedParams = Object.entries(userParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(':');

    return `user:${params.userId}:articles:${sortedParams}`;
  }

  /**
   * 検索クエリ用のキーを生成
   */
  private generateSearchKey(params: ArticleQueryParams): string {
    // 検索キーワードを正規化（スペース区切りでソート）
    const normalizedSearch = params.search
      ? params.search.trim().split(/[\s　]+/)
          .filter(k => k.length > 0)
          .sort()
          .join(',')
      : '';

    const searchParams = {
      search: normalizedSearch,
      page: params.page || 1,
      limit: params.limit || 20,
      sortBy: params.sortBy || 'publishedAt',
      category: params.category || 'all'
    };

    const sortedParams = Object.entries(searchParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(':');

    return `search:${sortedParams}`;
  }

  /**
   * 統計情報を取得
   */
  async getStats() {
    const l1Stats = this.l1Cache.getStats();
    const l2Stats = this.l2Cache.getStats();
    const l3Stats = this.l3Cache.getStats();

    return {
      l1: {
        namespace: '@techtrend/cache:l1:public',
        ttl: '1 hour',
        ...l1Stats
      },
      l2: {
        namespace: '@techtrend/cache:l2:user',
        ttl: '15 minutes',
        ...l2Stats
      },
      l3: {
        namespace: '@techtrend/cache:l3:search',
        ttl: '10 minutes',
        ...l3Stats
      },
      overall: {
        totalHits: l1Stats.hits + l2Stats.hits + l3Stats.hits,
        totalMisses: l1Stats.misses + l2Stats.misses + l3Stats.misses,
        overallHitRate: this.calculateHitRate(
          l1Stats.hits + l2Stats.hits + l3Stats.hits,
          l1Stats.misses + l2Stats.misses + l3Stats.misses
        )
      }
    };
  }

  /**
   * ヒット率を計算
   */
  private calculateHitRate(hits: number, misses: number): number {
    const total = hits + misses;
    return total > 0 ? Math.round((hits / total) * 100) : 0;
  }

  /**
   * 統計をリセット
   */
  resetStats(): void {
    this.l1Cache.resetStats();
    this.l2Cache.resetStats();
    this.l3Cache.resetStats();
  }
}

// シングルトンインスタンスをエクスポート
export const layeredCache = new LayeredCache();