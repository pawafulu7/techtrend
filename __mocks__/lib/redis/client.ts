/**
 * Redisクライアントのモック
 * ioredis互換のインターフェースを提供
 */

import { EventEmitter } from 'events';

// Redisクライアントのモック実装
class MockRedisClient extends EventEmitter {
  private store = new Map<string, string>();
  public get: any;
  public set: any;
  
  constructor() {
    super();
    // EventEmitterのメソッドをバインド
    this.on = this.on.bind(this);
    this.once = this.once.bind(this);
    this.off = this.off.bind(this);
    this.emit = this.emit.bind(this);
    
    // getメソッドを正しく初期化（mockResolvedValueが使えるように）
    this.get = jest.fn();
    this.get.mockImplementation((key) => {
      return Promise.resolve(this.store.get(key) || null);
    });
    
    // setメソッドも同様に初期化
    this.set = jest.fn();
    this.set.mockImplementation((key, value, ...args) => {
      this.store.set(key, value);
      // EXオプション付きのsetを処理
      if (args[0] === 'EX') {
        return Promise.resolve('OK');
      }
      return Promise.resolve('OK');
    });
  }
  // 基本的なRedisコマンドのモック（デフォルト値付き）
  // get/setは上記で初期化済み
  setex = jest.fn().mockResolvedValue('OK');
  del = jest.fn().mockImplementation((...keys) => {
    let count = 0;
    keys.forEach(key => {
      if (this.store.has(key)) {
        this.store.delete(key);
        count++;
      }
    });
    return Promise.resolve(count);
  });
  exists = jest.fn().mockImplementation((key) => {
    return Promise.resolve(this.store.has(key) ? 1 : 0);
  });
  expire = jest.fn().mockResolvedValue(1);
  ttl = jest.fn().mockResolvedValue(-2);
  keys = jest.fn().mockImplementation((pattern) => {
    const allKeys = Array.from(this.store.keys());
    if (pattern === '*') return Promise.resolve(allKeys);
    // 簡易的なパターンマッチング
    const regex = new RegExp(pattern.replace('*', '.*'));
    return Promise.resolve(allKeys.filter(key => regex.test(key)));
  });
  mget = jest.fn().mockImplementation((...keys) => {
    return Promise.resolve(keys.map(key => this.store.get(key) || null));
  });
  mset = jest.fn().mockImplementation((...args) => {
    for (let i = 0; i < args.length; i += 2) {
      this.store.set(args[i], args[i + 1]);
    }
    return Promise.resolve('OK');
  });
  
  // Hash操作
  hget = jest.fn();
  hset = jest.fn();
  hgetall = jest.fn();
  hdel = jest.fn();
  hexists = jest.fn();
  hincrby = jest.fn();
  
  // List操作
  lpush = jest.fn();
  rpush = jest.fn();
  lpop = jest.fn();
  rpop = jest.fn();
  lrange = jest.fn();
  llen = jest.fn();
  
  // Set操作
  sadd = jest.fn();
  srem = jest.fn();
  smembers = jest.fn();
  sismember = jest.fn();
  scard = jest.fn();
  
  // Sorted Set操作
  zadd = jest.fn();
  zrem = jest.fn();
  zrange = jest.fn();
  zrevrange = jest.fn();
  zscore = jest.fn();
  zcard = jest.fn();
  
  // Pub/Sub操作
  publish = jest.fn();
  subscribe = jest.fn();
  unsubscribe = jest.fn();
  
  // トランザクション
  multi = jest.fn(() => this);
  exec = jest.fn();
  discard = jest.fn();
  watch = jest.fn();
  unwatch = jest.fn();
  
  // 接続管理
  connect = jest.fn();
  disconnect = jest.fn();
  quit = jest.fn();
  ping = jest.fn();
  
  // ユーティリティ
  flushdb = jest.fn().mockImplementation(() => {
    this.store.clear();
    return Promise.resolve('OK');
  });
  flushall = jest.fn().mockImplementation(() => {
    this.store.clear();
    return Promise.resolve('OK');
  });
  dbsize = jest.fn().mockImplementation(() => {
    return Promise.resolve(this.store.size);
  });
  
  // Pipeline (チェーン可能なメソッド)
  pipeline = jest.fn(() => ({
    get: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  }));
  
  // ストアをクリアするヘルパーメソッド
  clearStore() {
    this.store.clear();
  }
}

// グローバルなRedisモックインスタンス
export const redisMock = new MockRedisClient();

// getRedisClient関数のモック
export const getRedisClient = jest.fn(() => redisMock);

// closeRedisConnection関数のモック
export const closeRedisConnection = jest.fn(() => Promise.resolve());

// 後方互換性のためのエクスポート
export const redis = redisMock;

// beforeEachフックでモックをリセット
beforeEach(() => {
  // ストアをクリア
  redisMock.clearStore();
  
  // 全てのモック関数をクリア
  Object.keys(redisMock).forEach(key => {
    const method = (redisMock as any)[key];
    if (typeof method === 'function' && method.mockClear) {
      method.mockClear();
    }
  });
  
  // getRedisClient関数もクリア
  getRedisClient.mockClear();
});

// デフォルトエクスポート
export default redisMock;