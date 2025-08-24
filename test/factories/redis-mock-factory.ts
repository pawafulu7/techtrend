/**
 * Redis Mock Factory
 * TestRedisClientをベースにJest環境でのモック機能を提供
 */

import { TestRedisClient } from '@/lib/redis/test-redis-client';
import { jest } from '@jest/globals';

// Redisクライアントのモック型定義
export interface RedisMockClient {
  store: Map<string, any>;
  get: jest.Mock<Promise<string | null>, [string]>;
  set: jest.Mock<Promise<string>, [string, string, ...any[]]>;
  setex: jest.Mock<Promise<string>, [string, number, string]>;
  del: jest.Mock<Promise<number>, string[]>;
  exists: jest.Mock<Promise<number>, [string]>;
  expire: jest.Mock<Promise<number>, [string, number]>;
  ttl: jest.Mock<Promise<number>, [string]>;
  keys: jest.Mock<Promise<string[]>, [string]>;
  mget: jest.Mock<Promise<(string | null)[]>, string[]>;
  mset: jest.Mock<Promise<string>, [Record<string, string>]>;
  hget: jest.Mock<Promise<string | null>, [string, string]>;
  hset: jest.Mock<Promise<number>, [string, string, string]>;
  hgetall: jest.Mock<Promise<Record<string, string>>, [string]>;
  hdel: jest.Mock<Promise<number>, [string, ...string[]]>;
  hexists: jest.Mock<Promise<number>, [string, string]>;
  lpush: jest.Mock<Promise<number>, [string, ...string[]]>;
  rpush: jest.Mock<Promise<number>, [string, ...string[]]>;
  lpop: jest.Mock<Promise<string | null>, [string]>;
  rpop: jest.Mock<Promise<string | null>, [string]>;
  lrange: jest.Mock<Promise<string[]>, [string, number, number]>;
  llen: jest.Mock<Promise<number>, [string]>;
  sadd: jest.Mock<Promise<number>, [string, ...string[]]>;
  srem: jest.Mock<Promise<number>, [string, ...string[]]>;
  smembers: jest.Mock<Promise<string[]>, [string]>;
  sismember: jest.Mock<Promise<number>, [string, string]>;
  scard: jest.Mock<Promise<number>, [string]>;
  zadd: jest.Mock<Promise<number>, [string, ...any[]]>;
  zrem: jest.Mock<Promise<number>, [string, ...string[]]>;
  zrange: jest.Mock<Promise<string[]>, [string, number, number]>;
  zscore: jest.Mock<Promise<string | null>, [string, string]>;
  zcard: jest.Mock<Promise<number>, [string]>;
  scan: jest.Mock<Promise<[string, string[]]>, [string, ...any[]]>;
  hscan: jest.Mock<Promise<[string, string[]]>, [string, string, ...any[]]>;
  sscan: jest.Mock<Promise<[string, string[]]>, [string, string, ...any[]]>;
  zscan: jest.Mock<Promise<[string, string[]]>, [string, string, ...any[]]>;
  flushdb: jest.Mock<Promise<string>, []>;
  flushall: jest.Mock<Promise<string>, []>;
  eval: jest.Mock<Promise<any>, [string, number, ...any[]]>;
  script: jest.Mock<Promise<any>, [string, ...any[]]>;
  multi: jest.Mock<any, []>;
  exec: jest.Mock<Promise<any[]>, []>;
  discard: jest.Mock<Promise<string>, []>;
  watch: jest.Mock<Promise<string>, string[]>;
  unwatch: jest.Mock<Promise<string>, []>;
  reset: jest.Mock<void, []>;
  disconnect: jest.Mock<void, []>;
  quit: jest.Mock<Promise<string>, []>;
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