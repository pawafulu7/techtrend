import { RedisCacheWithFallback } from './redis-cache-with-fallback';
import { distributedLock } from './distributed-lock';

/**
 * 分散ロック機能付きRedisCache
 * キャッシュスタンピード問題を防ぐ
 */
export class RedisCacheWithLock extends RedisCacheWithFallback {
  private readonly lockTTL = 30; // ロックの有効期限（秒）
  private readonly stampedePrevention = true; // スタンピード防止を有効化

  /**
   * getOrSetの分散ロック対応版
   * 同時に複数のリクエストが来ても、1つだけがデータ取得を実行
   */
  async getOrSetWithLock<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // キャッシュをチェック
    const cached = await this.get<T>(key);
    if (cached !== null) {
      this.stats.hits++;
      return cached;
    }

    this.stats.misses++;

    if (!this.stampedePrevention) {
      // スタンピード防止無効時は通常のgetOrSet
      return await this.getOrSetWithFallback(key, fetcher, ttl);
    }

    // 分散ロックを取得
    const lockKey = `cache:${key}`;
    const lockToken = await distributedLock.acquireWithWait(lockKey, this.lockTTL);

    if (!lockToken) {
      // ロック取得失敗 - 他のプロセスが処理中
      
      // 少し待ってからキャッシュを再チェック
      await this.sleep(100);
      
      // 最大10回リトライ
      for (let i = 0; i < 10; i++) {
        const retryResult = await this.get<T>(key);
        if (retryResult !== null) {
          return retryResult;
        }
        await this.sleep(200);
      }
      
      // それでも取得できない場合は直接実行
      return await fetcher();
    }

    try {
      // ロック取得後、もう一度キャッシュをチェック（ダブルチェック）
      const doubleCheck = await this.get<T>(key);
      if (doubleCheck !== null) {
        return doubleCheck;
      }

      // データを取得してキャッシュに保存
      const data = await fetcher();
      await this.set(key, data, ttl);
      
      return data;
    } finally {
      // ロックを解放
      await distributedLock.release(lockKey, lockToken);
    }
  }

  /**
   * 複数キーの一括取得（ロック付き）
   * @param keys キーのリスト
   * @param fetcher データ取得関数（キーごと）
   * @param ttl TTL
   */
  async multiGetOrSetWithLock<T>(
    keys: string[],
    fetcher: (key: string) => Promise<T>,
    ttl?: number
  ): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    
    // 並列実行（ただし最大5並列）
    const batchSize = 5;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async key => {
          const value = await this.getOrSetWithLock(key, () => fetcher(key), ttl);
          return { key, value };
        })
      );
      
      for (const { key, value } of batchResults) {
        results.set(key, value);
      }
    }
    
    return results;
  }

  /**
   * キャッシュスタンピード防止の有効/無効切り替え
   * @param enabled 有効化フラグ
   */
  setStampedePrevention(enabled: boolean) {
    (this as unknown).stampedePrevention = enabled;
  }

  /**
   * 現在のロック状態を取得
   * @param key キャッシュキー
   */
  async getLockStatus(key: string): Promise<{
    locked: boolean;
    ttl: number;
  }> {
    const lockKey = `cache:${key}`;
    const locked = await distributedLock.exists(lockKey);
    const ttl = locked ? await distributedLock.getTTL(lockKey) : -1;
    
    return { locked, ttl };
  }

  /**
   * スリープ関数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 統計情報の拡張版
   */
  getExtendedStats() {
    const baseStats = this.getStats();
    const memoryCacheStats = this.getMemoryCacheStats();
    
    return {
      ...baseStats,
      memoryCache: memoryCacheStats,
      stampedePrevention: this.stampedePrevention,
      lockTTL: this.lockTTL
    };
  }
}