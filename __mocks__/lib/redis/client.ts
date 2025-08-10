/**
 * Redisクライアントのモック
 * ioredis互換のインターフェースを提供
 */

// Redisクライアントのモック実装
class MockRedisClient {
  // 基本的なRedisコマンドのモック
  get = jest.fn();
  set = jest.fn();
  setex = jest.fn();
  del = jest.fn();
  exists = jest.fn();
  expire = jest.fn();
  ttl = jest.fn();
  keys = jest.fn();
  mget = jest.fn();
  mset = jest.fn();
  
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
  flushdb = jest.fn();
  flushall = jest.fn();
  dbsize = jest.fn();
  
  // Pipeline (チェーン可能なメソッド)
  pipeline = jest.fn(() => ({
    get: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  }));
  
  // イベントエミッター風のメソッド
  on = jest.fn();
  once = jest.fn();
  off = jest.fn();
  emit = jest.fn();
}

// グローバルなRedisモックインスタンス
export const redisMock = new MockRedisClient();

// getRedisClient関数のモック
export const getRedisClient = jest.fn(() => redisMock);

// beforeEachフックでモックをリセット
beforeEach(() => {
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