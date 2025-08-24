import { getRedisClient } from '@/lib/redis/client';

/**
 * 分散ロック実装
 * キャッシュスタンピード問題を防ぐための排他制御
 */
export class DistributedLock {
  private redis = getRedisClient();
  private readonly defaultLockTTL = 30; // 30秒
  private readonly maxWaitTime = 5000; // 最大5秒待機
  private readonly retryInterval = 50; // 50ms間隔でリトライ

  /**
   * ロックを取得
   * @param key ロックキー
   * @param ttl ロックの有効期限（秒）
   * @returns ロックトークン（ロック解放時に必要）
   */
  async acquire(key: string, ttl: number = this.defaultLockTTL): Promise<string | null> {
    const lockKey = `lock:${key}`;
    const lockToken = this.generateToken();
    
    try {
      // SET key value NX EX ttl
      const result = await this.redis.set(
        lockKey,
        lockToken,
        'NX', // Only set if not exists
        'EX', // Expire time in seconds
        ttl
      );
      
      if (result === 'OK') {
        console.log(`[DistributedLock] Lock acquired for key: ${lockKey}`);
        return lockToken;
      }
      
      return null;
    } catch (error) {
      console.error('[DistributedLock] Failed to acquire lock:', error);
      return null;
    }
  }

  /**
   * ロックを取得（待機あり）
   * @param key ロックキー
   * @param ttl ロックの有効期限（秒）
   * @returns ロックトークン
   */
  async acquireWithWait(key: string, ttl: number = this.defaultLockTTL): Promise<string | null> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < this.maxWaitTime) {
      const token = await this.acquire(key, ttl);
      if (token) {
        return token;
      }
      
      // 短時間待機してリトライ
      await this.sleep(this.retryInterval);
    }
    
    console.log(`[DistributedLock] Failed to acquire lock after ${this.maxWaitTime}ms for key: lock:${key}`);
    return null;
  }

  /**
   * ロックを解放
   * @param key ロックキー
   * @param token ロックトークン
   * @returns 解放成功の可否
   */
  async release(key: string, token: string): Promise<boolean> {
    const lockKey = `lock:${key}`;
    
    try {
      // Luaスクリプトで原子性を保証
      // トークンが一致する場合のみ削除
      // スクリプトを定数として定義（安全性向上）
      const RELEASE_SCRIPT = [
        'if redis.call("get", KEYS[1]) == ARGV[1] then',
        '  return redis.call("del", KEYS[1])',
        'else',
        '  return 0',
        'end'
      ].join('\n');
      
      const result = await this.redis.eval(RELEASE_SCRIPT, 1, lockKey, token) as number;
      
      if (result === 1) {
        console.log(`[DistributedLock] Lock released for key: ${lockKey}`);
        return true;
      }
      
      console.log(`[DistributedLock] Lock release failed - token mismatch for key: ${lockKey}`);
      return false;
    } catch (error) {
      console.error('[DistributedLock] Failed to release lock:', error);
      return false;
    }
  }

  /**
   * ロックを使用して処理を実行
   * @param key ロックキー
   * @param fn 実行する処理
   * @param ttl ロックの有効期限（秒）
   * @returns 処理結果
   */
  async executeWithLock<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number = this.defaultLockTTL
  ): Promise<T | null> {
    const token = await this.acquireWithWait(key, ttl);
    
    if (!token) {
      console.log(`[DistributedLock] Could not acquire lock for key: ${key}`);
      return null;
    }
    
    try {
      const result = await fn();
      return result;
    } finally {
      await this.release(key, token);
    }
  }

  /**
   * ロックの存在確認
   * @param key ロックキー
   * @returns ロックが存在するか
   */
  async exists(key: string): Promise<boolean> {
    const lockKey = `lock:${key}`;
    try {
      const exists = await this.redis.exists(lockKey);
      return exists === 1;
    } catch (error) {
      console.error('[DistributedLock] Failed to check lock existence:', error);
      return false;
    }
  }

  /**
   * ロックの残り有効期限を取得
   * @param key ロックキー
   * @returns 残り有効期限（秒）、存在しない場合は-1
   */
  async getTTL(key: string): Promise<number> {
    const lockKey = `lock:${key}`;
    try {
      const ttl = await this.redis.ttl(lockKey);
      return ttl;
    } catch (error) {
      console.error('[DistributedLock] Failed to get lock TTL:', error);
      return -1;
    }
  }

  /**
   * トークン生成
   */
  private generateToken(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * スリープ関数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// シングルトンインスタンス
export const distributedLock = new DistributedLock();