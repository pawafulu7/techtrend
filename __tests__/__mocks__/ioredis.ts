// ioredisモック - デフォルトエクスポートとしてコンストラクタを提供
class Redis {
  // 基本的なRedisコマンドのモック
  get = jest.fn().mockResolvedValue(null);
  set = jest.fn().mockResolvedValue('OK');
  setex = jest.fn().mockResolvedValue('OK');
  del = jest.fn().mockResolvedValue(1);
  exists = jest.fn().mockResolvedValue(0);
  expire = jest.fn().mockResolvedValue(1);
  ttl = jest.fn().mockResolvedValue(-2);
  keys = jest.fn().mockResolvedValue([]);
  mget = jest.fn().mockResolvedValue([]);
  mset = jest.fn().mockResolvedValue('OK');
  
  // Hash操作
  hget = jest.fn().mockResolvedValue(null);
  hset = jest.fn().mockResolvedValue(1);
  hgetall = jest.fn().mockResolvedValue({});
  hdel = jest.fn().mockResolvedValue(1);
  hexists = jest.fn().mockResolvedValue(0);
  hincrby = jest.fn().mockResolvedValue(0);
  
  // List操作
  lpush = jest.fn().mockResolvedValue(1);
  rpush = jest.fn().mockResolvedValue(1);
  lpop = jest.fn().mockResolvedValue(null);
  rpop = jest.fn().mockResolvedValue(null);
  lrange = jest.fn().mockResolvedValue([]);
  llen = jest.fn().mockResolvedValue(0);
  
  // Set操作
  sadd = jest.fn().mockResolvedValue(1);
  srem = jest.fn().mockResolvedValue(1);
  smembers = jest.fn().mockResolvedValue([]);
  sismember = jest.fn().mockResolvedValue(0);
  scard = jest.fn().mockResolvedValue(0);
  
  // Sorted Set操作
  zadd = jest.fn().mockResolvedValue(1);
  zrem = jest.fn().mockResolvedValue(1);
  zrange = jest.fn().mockResolvedValue([]);
  zrevrange = jest.fn().mockResolvedValue([]);
  zscore = jest.fn().mockResolvedValue(null);
  zcard = jest.fn().mockResolvedValue(0);
  
  // Pub/Sub操作
  publish = jest.fn().mockResolvedValue(0);
  subscribe = jest.fn().mockResolvedValue('OK');
  unsubscribe = jest.fn().mockResolvedValue('OK');
  
  // トランザクション
  multi = jest.fn(() => this);
  exec = jest.fn().mockResolvedValue([]);
  discard = jest.fn().mockResolvedValue('OK');
  watch = jest.fn().mockResolvedValue('OK');
  unwatch = jest.fn().mockResolvedValue('OK');
  
  // 接続管理
  connect = jest.fn().mockResolvedValue(undefined);
  disconnect = jest.fn().mockResolvedValue(undefined);
  quit = jest.fn().mockResolvedValue('OK');
  ping = jest.fn().mockResolvedValue('PONG');
  
  // ユーティリティ
  flushdb = jest.fn().mockResolvedValue('OK');
  flushall = jest.fn().mockResolvedValue('OK');
  dbsize = jest.fn().mockResolvedValue(0);
  
  // Pipeline (チェーン可能なメソッド)
  pipeline = jest.fn(() => ({
    get: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  }));
  
  // イベントエミッター風のメソッド
  on = jest.fn();
  once = jest.fn();
  off = jest.fn();
  emit = jest.fn();
}

// デフォルトエクスポート（コンストラクタとして）
export default Redis;

// 名前付きエクスポート（互換性のため）
export { Redis };