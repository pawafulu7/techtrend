/**
 * Redis Mock Factory
 * TestRedisClientをベースにJest環境でのモック機能を提供
 */

import { TestRedisClient } from '@/lib/redis/test-redis-client';
import { jest } from '@jest/globals';

// Redisクライアントのモック型定義
export interface RedisMockClient {
  store: Map<string, any>;
  get: jest.Mock<Promise<string | null>>;
  set: jest.Mock<Promise<string>>;
  setex: jest.Mock<Promise<string>>;
  del: jest.Mock<Promise<number>>;
  exists: jest.Mock<Promise<number>>;
  expire: jest.Mock<Promise<number>>;
  ttl: jest.Mock<Promise<number>>;
  keys: jest.Mock<Promise<string[]>>;
  mget: jest.Mock<Promise<(string | null)[]>>;
  mset: jest.Mock<Promise<string>>;
  hget: jest.Mock<Promise<string | null>>;
  hset: jest.Mock<Promise<number>>;
  hgetall: jest.Mock<Promise<Record<string, string>>>;
  hdel: jest.Mock<Promise<number>>;
  hexists: jest.Mock<Promise<number>>;
  lpush: jest.Mock<Promise<number>>;
  rpush: jest.Mock<Promise<number>>;
  lpop: jest.Mock<Promise<string | null>>;
  rpop: jest.Mock<Promise<string | null>>;
  lrange: jest.Mock<Promise<string[]>>;
  llen: jest.Mock<Promise<number>>;
  sadd: jest.Mock<Promise<number>>;
  srem: jest.Mock<Promise<number>>;
  smembers: jest.Mock<Promise<string[]>>;
  sismember: jest.Mock<Promise<number>>;
  scard: jest.Mock<Promise<number>>;
  zadd: jest.Mock<Promise<number>>;
  zrem: jest.Mock<Promise<number>>;
  zrange: jest.Mock<Promise<string[]>>;
  zscore: jest.Mock<Promise<string | null>>;
  zcard: jest.Mock<Promise<number>>;
  scan: jest.Mock<Promise<[string, string[]]>>;
  hscan: jest.Mock<Promise<[string, string[]]>>;
  sscan: jest.Mock<Promise<[string, string[]]>>;
  zscan: jest.Mock<Promise<[string, string[]]>>;
  flushdb: jest.Mock<Promise<string>>;
  flushall: jest.Mock<Promise<string>>;
  clear: jest.Mock<Promise<string>>;
  eval: jest.Mock<Promise<any>>;
  script: jest.Mock<Promise<any>>;
  multi: jest.Mock<any>;
  exec: jest.Mock<Promise<any[]>>;
  discard: jest.Mock<Promise<string>>;
  watch: jest.Mock<Promise<string>>;
  unwatch: jest.Mock<Promise<string>>;
  reset: jest.Mock<void>;
  disconnect: jest.Mock<void>;
  quit: jest.Mock<Promise<string>>;
}

export class RedisMockFactory {
  private static instances = new Map<string, RedisMockClient>();
  
  /**
   * Redisモックインスタンスを作成または取得
   * @param key インスタンスキー（デフォルト: 'default'）
   * @returns モックされたRedisクライアント
   */
  static createMock(key: string = 'default'): RedisMockClient {
    if (!this.instances.has(key)) {
      const client = new TestRedisClient();
      const clientAny = client as any;
      
      // Jest環境内でのラッパー
      const mockWrapper: RedisMockClient = {
        // ストアへの直接アクセス（テスト用）
        store: clientAny.store,
        
        // 基本的なRedis操作
        get: jest.fn().mockImplementation((key: string) => client.get(key)) as any,
        set: jest.fn().mockImplementation((key: string, value: string, ...args: any[]) => {
          // EXオプション付きのsetを処理
          if (args[0] === 'EX' && args[1]) {
            return client.setex(key, args[1], value);
          }
          return client.set(key, value);
        }) as any,
        setex: jest.fn().mockImplementation((key: string, ttl: number, value: string) => 
          client.setex(key, ttl, value)
        ) as any,
        del: jest.fn().mockImplementation((...keys: string[]) => client.del(keys)) as any,
        exists: jest.fn().mockImplementation((key: string) => client.exists(key)) as any,
        expire: jest.fn().mockImplementation((key: string, ttl: number) => 
          client.expire(key, ttl)
        ) as any,
        ttl: jest.fn().mockImplementation((key: string) => client.ttl(key)) as any,
        keys: jest.fn().mockImplementation((pattern: string) => client.keys(pattern)) as any,
        mget: jest.fn().mockImplementation((...keys: string[]) => client.mget(...keys)) as any,
        mset: jest.fn().mockImplementation((obj: Record<string, string>) => client.mset(obj)) as any,
        
        // Hash操作
        hget: jest.fn().mockImplementation((key: string, field: string) => 
          client.hget(key, field)
        ) as any,
        hset: jest.fn().mockImplementation((key: string, field: string, value: string) => 
          client.hset(key, field, value)
        ) as any,
        hgetall: jest.fn().mockImplementation((key: string) => client.hgetall(key)) as any,
        hdel: jest.fn().mockImplementation((key: string, ...fields: string[]) => 
          client.hdel(key, ...fields)
        ) as any,
        hexists: jest.fn().mockImplementation((key: string, field: string) => 
          client.hexists(key, field)
        ) as any,
        
        // List操作
        lpush: jest.fn().mockImplementation((key: string, ...values: string[]) => 
          client.lpush(key, ...values)
        ) as any,
        rpush: jest.fn().mockImplementation((key: string, ...values: string[]) => 
          client.rpush(key, ...values)
        ) as any,
        lpop: jest.fn().mockImplementation((key: string) => client.lpop(key)) as any,
        rpop: jest.fn().mockImplementation((key: string) => client.rpop(key)) as any,
        lrange: jest.fn().mockImplementation((key: string, start: number, stop: number) => 
          client.lrange(key, start, stop)
        ) as any,
        llen: jest.fn().mockImplementation((key: string) => client.llen(key)) as any,
        
        // Set操作
        sadd: jest.fn().mockImplementation((key: string, ...members: string[]) => 
          client.sadd(key, ...members)
        ) as any,
        srem: jest.fn().mockImplementation((key: string, ...members: string[]) => 
          client.srem(key, ...members)
        ) as any,
        smembers: jest.fn().mockImplementation((key: string) => client.smembers(key)) as any,
        sismember: jest.fn().mockImplementation((key: string, member: string) => 
          client.sismember(key, member)
        ) as any,
        scard: jest.fn().mockImplementation((key: string) => client.scard(key)) as any,
        
        // Sorted Set操作
        zadd: jest.fn().mockImplementation((key: string, ...args: any[]) => 
          client.zadd(key, ...args)
        ) as any,
        zrem: jest.fn().mockImplementation((key: string, ...members: string[]) => 
          client.zrem(key, ...members)
        ) as any,
        zrange: jest.fn().mockImplementation((key: string, start: number, stop: number) => 
          client.zrange(key, start, stop)
        ) as any,
        zscore: jest.fn().mockImplementation((key: string, member: string) => 
          client.zscore(key, member)
        ) as any,
        zcard: jest.fn().mockImplementation((key: string) => client.zcard(key)) as any,
        
        // Scan操作
        scan: jest.fn().mockImplementation((cursor: string, ...args: any[]) => 
          client.scan(cursor, ...args)
        ) as any,
        hscan: jest.fn().mockImplementation((key: string, cursor: string, ...args: any[]) => 
          client.hscan(key, cursor, ...args)
        ) as any,
        sscan: jest.fn().mockImplementation((key: string, cursor: string, ...args: any[]) => 
          client.sscan(key, cursor, ...args)
        ) as any,
        zscan: jest.fn().mockImplementation((key: string, cursor: string, ...args: any[]) => 
          client.zscan(key, cursor, ...args)
        ) as any,
        
        // データベース操作
        flushdb: jest.fn().mockImplementation(() => client.flushdb()) as any,
        flushall: jest.fn().mockImplementation(() => client.flushall()) as any,
        clear: jest.fn().mockImplementation(() => {
          clientAny.store.clear();
          return Promise.resolve('OK');
        }) as any,
        
        // スクリプト操作（サポートなし）
        eval: jest.fn().mockResolvedValue(null) as any,
        script: jest.fn().mockResolvedValue(null) as any,
        
        // トランザクション操作（簡易サポート）
        multi: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
          discard: jest.fn().mockResolvedValue('OK')
        }) as any,
        exec: jest.fn().mockResolvedValue([]) as any,
        discard: jest.fn().mockResolvedValue('OK') as any,
        watch: jest.fn().mockResolvedValue('OK') as any,
        unwatch: jest.fn().mockResolvedValue('OK') as any,
        
        // テスト用メソッド
        reset: jest.fn().mockImplementation(() => {
          clientAny.store.clear();
        }) as any,
        
        // 接続管理
        disconnect: jest.fn() as any,
        quit: jest.fn().mockResolvedValue('OK') as any
      };
      
      this.instances.set(key, mockWrapper);
    }
    
    return this.instances.get(key)!;
  }
  
  /**
   * 特定のインスタンスをリセット
   * @param key インスタンスキー
   */
  static reset(key: string = 'default'): void {
    const instance = this.instances.get(key);
    if (instance) {
      instance.reset();
      // モック呼び出し記録もクリア
      Object.values(instance).forEach(value => {
        if (typeof value === 'function' && 'mockClear' in value) {
          (value as jest.Mock).mockClear();
        }
      });
    }
  }
  
  /**
   * すべてのインスタンスをリセット
   */
  static resetAll(): void {
    this.instances.forEach((_, key) => this.reset(key));
  }
  
  /**
   * インスタンスを削除
   * @param key インスタンスキー
   */
  static destroy(key: string = 'default'): void {
    this.instances.delete(key);
  }
  
  /**
   * すべてのインスタンスを削除
   */
  static destroyAll(): void {
    this.instances.clear();
  }
}

// デフォルトエクスポート
export default RedisMockFactory;