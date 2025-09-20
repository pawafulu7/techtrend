/**
 * DataLoader Cache Utilities
 * 二層キャッシュ操作の共通ユーティリティ
 * codex推奨: キャッシュ昇格・バッチ分解・統計収集の共通化
 */

import { DataLoaderMemoryCache } from '@/lib/cache/memory-cache';
import { RedisCache } from '@/lib/cache/redis-cache';
import logger from '@/lib/logger';

/**
 * キャッシュ層の定義
 */
export interface CacheLayer<T> {
  get(key: string): T | null | Promise<T | null>;
  set(key: string, value: T, ttl?: number): void | Promise<void>;
  delete(key: string): boolean | Promise<boolean>;
  mget?(keys: string[]): Map<string, T | null> | Promise<Map<string, T | null>>;
  mset?(entries: Array<{ key: string; value: T; ttl?: number }>): void | Promise<void>;
}

/**
 * バッチローダーの結果型
 */
export interface BatchResult<T> {
  key: string;
  value: T;
  fromCache: 'l1' | 'l2' | 'db';
}

/**
 * キャッシュ統計
 */
export interface CacheStats {
  l1Hits: number;
  l2Hits: number;
  dbQueries: number;
  totalRequests: number;
  batchCount: number;
}

/**
 * 二層キャッシュマネージャー
 */
export class TwoLayerCacheManager<T> {
  private stats: CacheStats = {
    l1Hits: 0,
    l2Hits: 0,
    dbQueries: 0,
    totalRequests: 0,
    batchCount: 0,
  };

  constructor(
    private readonly l1Cache: CacheLayer<T>,
    private readonly l2Cache: CacheLayer<T> | null,
    private readonly prefix: string,
    private readonly l1TTL: number = 30,
    private readonly l2TTL: number = 60
  ) {}

  /**
   * バッチローディングの共通処理
   * codex推奨: バッチ分解とキャッシュ昇格の共通化
   */
  async batchLoad<K extends string>(
    keys: readonly K[],
    dbFetcher: (missingKeys: K[]) => Promise<Map<K, T>>,
    options?: {
      logPrefix?: string;
      statsCallback?: (stats: CacheStats) => void;
    }
  ): Promise<T[]> {
    const startTime = Date.now();
    this.stats.batchCount++;
    this.stats.totalRequests += keys.length;

    const results = new Map<K, T>();
    const l2CheckList: K[] = [];
    const dbCheckList: K[] = [];

    // Step 1: L1メモリキャッシュチェック
    for (const key of keys) {
      const cacheKey = `${this.prefix}:${key}`;
      const cached = await this.l1Cache.get(cacheKey);

      if (cached !== null) {
        this.stats.l1Hits++;
        results.set(key, cached);
      } else {
        l2CheckList.push(key);
      }
    }

    // 全てL1ヒットの場合
    if (l2CheckList.length === 0) {
      logger.debug(`${options?.logPrefix || this.prefix}.l1-hit-all: ${keys.length} keys, ${Date.now() - startTime}ms`);
      return keys.map(key => results.get(key)!);
    }

    // Step 2: L2 Redisキャッシュチェック
    if (this.l2Cache && l2CheckList.length > 0) {
      try {
        const l2Results = await Promise.all(
          l2CheckList.map(async (key) => {
            const cacheKey = `${this.prefix}:${key}`;
            const cached = await this.l2Cache!.get(cacheKey);
            return { key, value: cached };
          })
        );

        for (const { key, value } of l2Results) {
          if (value !== null) {
            this.stats.l2Hits++;
            results.set(key, value);

            // L1に昇格（非同期）
            const cacheKey = `${this.prefix}:${key}`;
            Promise.resolve(this.l1Cache.set(cacheKey, value, this.l1TTL)).catch(err => {
              logger.debug(`${this.prefix}.l1-promote-error: ${err}`);
            });
          } else {
            dbCheckList.push(key);
          }
        }
      } catch (error) {
        logger.warn(`${options?.logPrefix || this.prefix}.l2-error: ${error}`);
        dbCheckList.push(...l2CheckList);
      }
    } else {
      dbCheckList.push(...l2CheckList);
    }

    // 全てキャッシュヒットの場合
    if (dbCheckList.length === 0) {
      logger.debug(`${options?.logPrefix || this.prefix}.cache-hit-all: L1=${this.stats.l1Hits}, L2=${this.stats.l2Hits}, ${Date.now() - startTime}ms`);
      return keys.map(key => results.get(key)!);
    }

    // Step 3: データベースクエリ
    this.stats.dbQueries++;
    const dbResults = await dbFetcher(dbCheckList);

    // DB結果をキャッシュに保存
    const cacheWrites: Promise<any>[] = [];

    for (const [key, value] of dbResults.entries()) {
      results.set(key, value);
      const cacheKey = `${this.prefix}:${key}`;

      // L1に保存
      cacheWrites.push(
        Promise.resolve(this.l1Cache.set(cacheKey, value, this.l1TTL))
      );

      // L2に保存（非同期）
      if (this.l2Cache) {
        cacheWrites.push(
          Promise.resolve(this.l2Cache.set(cacheKey, value, this.l2TTL)).catch(err => {
            logger.debug(`${this.prefix}.l2-save-error: ${err}`);
          })
        );
      }
    }

    // キャッシュ書き込みを並行実行（結果を待たない）
    Promise.all(cacheWrites).catch(err => {
      logger.debug(`${this.prefix}.cache-write-error: ${err}`);
    });

    const duration = Date.now() - startTime;
    logger.info(`${options?.logPrefix || this.prefix}.batch: total=${keys.length}, L1=${this.stats.l1Hits}, L2=${this.stats.l2Hits}, DB=${dbCheckList.length}, ${duration}ms`);

    // コールバック実行
    if (options?.statsCallback) {
      options.statsCallback(this.stats);
    }

    // 結果を元の順序で返す
    return keys.map(key => results.get(key)!);
  }

  /**
   * キャッシュの無効化
   * codex推奨: Write-Through戦略
   */
  async invalidate(key: string): Promise<void> {
    const cacheKey = `${this.prefix}:${key}`;

    // L1とL2を並行して無効化
    const invalidations: Promise<any>[] = [
      Promise.resolve(this.l1Cache.delete(cacheKey))
    ];

    if (this.l2Cache) {
      invalidations.push(
        Promise.resolve(this.l2Cache.delete(cacheKey))
      );
    }

    await Promise.all(invalidations);
    logger.debug(`${this.prefix}.invalidated: ${cacheKey}`);
  }

  /**
   * パターンによる一括無効化
   * codex推奨: バルク更新対応
   */
  async invalidatePattern(pattern: string): Promise<number> {
    let count = 0;

    // L1の無効化（同期的な場合）
    if ('deletePattern' in this.l1Cache && typeof this.l1Cache.deletePattern === 'function') {
      count += await this.l1Cache.deletePattern(pattern);
    }

    // L2の無効化
    if (this.l2Cache && 'delete' in this.l2Cache) {
      await this.l2Cache.delete(pattern);
    }

    logger.debug(`${this.prefix}.invalidated-pattern: ${pattern}, count=${count}`);
    return count;
  }

  /**
   * 統計情報取得
   */
  getStats(): CacheStats & { hitRate: string; l1HitRate: string; l2HitRate: string } {
    const total = this.stats.totalRequests;
    const hits = this.stats.l1Hits + this.stats.l2Hits;

    return {
      ...this.stats,
      hitRate: total > 0 ? `${((hits / total) * 100).toFixed(2)}%` : '0%',
      l1HitRate: total > 0 ? `${((this.stats.l1Hits / total) * 100).toFixed(2)}%` : '0%',
      l2HitRate: total > 0 ? `${((this.stats.l2Hits / total) * 100).toFixed(2)}%` : '0%',
    };
  }

  /**
   * 統計情報リセット
   */
  resetStats(): void {
    this.stats = {
      l1Hits: 0,
      l2Hits: 0,
      dbQueries: 0,
      totalRequests: 0,
      batchCount: 0,
    };
  }
}

/**
 * キャッシュキー生成ユーティリティ
 */
export class CacheKeyBuilder {
  /**
   * ユーザーと記事の複合キー
   */
  static userArticle(userId: string, articleId: string, prefix: string): string {
    return `${prefix}:${userId}:${articleId}`;
  }

  /**
   * ユーザーキー
   */
  static user(userId: string, prefix: string): string {
    return `${prefix}:user:${userId}`;
  }

  /**
   * 記事キー
   */
  static article(articleId: string, prefix: string): string {
    return `${prefix}:article:${articleId}`;
  }

  /**
   * バージョン付きキー
   * codex推奨: namespace管理
   */
  static versioned(key: string, version: string | number): string {
    return `${key}:v${version}`;
  }
}