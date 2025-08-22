/**
 * Redis Mock Factory
 * TestRedisClientをベースにJest環境でのモック機能を提供
 */

import { TestRedisClient } from '@/lib/redis/test-redis-client';

export class RedisMockFactory {
  private static instances = new Map<string, any>();
  
  /**
   * Redisモックインスタンスを作成または取得
   * @param key インスタンスキー（デフォルト: 'default'）
   * @returns モックされたRedisクライアント
   */
  static createMock(key: string = 'default'): any {
    if (!this.instances.has(key)) {
      const client = new TestRedisClient();
      
      // Jest環境内でのラッパー
      const mockWrapper = {
        // ストアへの直接アクセス（テスト用）
        store: (client as any).store,
        
        // 基本的なRedis操作
        get: jest.fn().mockImplementation((key: string) => client.get(key)),
        set: jest.fn().mockImplementation((key: string, value: string, ...args: any[]) => {
          // EXオプション付きのsetを処理
          if (args[0] === 'EX' && args[1]) {
            return client.setex(key, args[1], value);
          }
          return client.set(key, value);
        }),
        setex: jest.fn().mockImplementation((key: string, ttl: number, value: string) => 
          client.setex(key, ttl, value)
        ),
        del: jest.fn().mockImplementation((...keys: string[]) => client.del(keys)),
        exists: jest.fn().mockImplementation((key: string) => client.exists(key)),
        expire: jest.fn().mockImplementation((key: string, ttl: number) => 
          client.expire(key, ttl)
        ),
        ttl: jest.fn().mockImplementation((key: string) => client.ttl(key)),
        keys: jest.fn().mockImplementation((pattern: string) => client.keys(pattern)),
        mget: jest.fn().mockImplementation((...keys: string[]) => client.mget(...keys)),
        mset: jest.fn().mockImplementation((obj: Record<string, string>) => client.mset(obj)),
        
        // Hash操作
        hget: jest.fn().mockImplementation((key: string, field: string) => 
          client.hget(key, field)
        ),
        hset: jest.fn().mockImplementation((key: string, field: string, value: string) => 
          client.hset(key, field, value)
        ),
        hgetall: jest.fn().mockImplementation((key: string) => client.hgetall(key)),
        hdel: jest.fn().mockImplementation((key: string, ...fields: string[]) => 
          client.hdel(key, ...fields)
        ),
        hexists: jest.fn().mockImplementation((key: string, field: string) => 
          client.hexists(key, field)
        ),
        
        // List操作
        lpush: jest.fn().mockImplementation((key: string, ...values: string[]) => 
          client.lpush(key, ...values)
        ),
        rpush: jest.fn().mockImplementation((key: string, ...values: string[]) => 
          client.rpush(key, ...values)
        ),
        lpop: jest.fn().mockImplementation((key: string) => client.lpop(key)),
        rpop: jest.fn().mockImplementation((key: string) => client.rpop(key)),
        lrange: jest.fn().mockImplementation((key: string, start: number, stop: number) => 
          client.lrange(key, start, stop)
        ),
        llen: jest.fn().mockImplementation((key: string) => client.llen(key)),
        
        // Set操作
        sadd: jest.fn().mockImplementation((key: string, ...members: string[]) => 
          client.sadd(key, ...members)
        ),
        srem: jest.fn().mockImplementation((key: string, ...members: string[]) => 
          client.srem(key, ...members)
        ),
        smembers: jest.fn().mockImplementation((key: string) => client.smembers(key)),
        sismember: jest.fn().mockImplementation((key: string, member: string) => 
          client.sismember(key, member)
        ),
        scard: jest.fn().mockImplementation((key: string) => client.scard(key)),
        
        // Sorted Set操作
        zadd: jest.fn().mockImplementation((key: string, ...args: any[]) => 
          client.zadd(key, ...args)
        ),
        zrem: jest.fn().mockImplementation((key: string, ...members: string[]) => 
          client.zrem(key, ...members)
        ),
        zrange: jest.fn().mockImplementation((key: string, start: number, stop: number) => 
          client.zrange(key, start, stop)
        ),
        zscore: jest.fn().mockImplementation((key: string, member: string) => 
          client.zscore(key, member)
        ),
        zcard: jest.fn().mockImplementation((key: string) => client.zcard(key)),
        
        // その他のメソッド
        ping: jest.fn().mockResolvedValue('PONG'),
        flushdb: jest.fn().mockImplementation(() => {
          client.clear();
          return Promise.resolve('OK');
        }),
        flushall: jest.fn().mockImplementation(() => {
          client.clear();
          return Promise.resolve('OK');
        }),
        
        // EventEmitterメソッド（互換性のため）
        on: jest.fn(),
        once: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
        
        // ユーティリティメソッド
        clear: () => client.clear(),
        clearStore: () => client.clear(),
        
        // Pipeline（チェーン可能なメソッド）
        pipeline: jest.fn(() => ({
          get: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          del: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([]),
        })),
        
        // Multi（トランザクション）
        multi: jest.fn(() => ({
          get: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          del: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([]),
        })),
      };
      
      this.instances.set(key, mockWrapper);
    }
    return this.instances.get(key);
  }
  
  /**
   * モックインスタンスをリセット
   * @param key インスタンスキー（指定なしで全インスタンスをリセット）
   */
  static reset(key?: string): void {
    if (key) {
      const instance = this.instances.get(key);
      if (instance) {
        instance.clear?.();
        // Jest関数のモック履歴をクリア
        Object.keys(instance).forEach(prop => {
          if (instance[prop]?.mockClear) {
            instance[prop].mockClear();
          }
        });
      }
    } else {
      // 全インスタンスをリセット
      this.instances.forEach(instance => {
        instance.clear?.();
        Object.keys(instance).forEach(prop => {
          if (instance[prop]?.mockClear) {
            instance[prop].mockClear();
          }
        });
      });
    }
  }
  
  /**
   * 特定のインスタンスを削除
   * @param key インスタンスキー
   */
  static destroy(key: string): void {
    const instance = this.instances.get(key);
    if (instance) {
      instance.clear?.();
      this.instances.delete(key);
    }
  }
  
  /**
   * 全インスタンスを削除
   */
  static destroyAll(): void {
    this.instances.forEach(instance => instance.clear?.());
    this.instances.clear();
  }
}