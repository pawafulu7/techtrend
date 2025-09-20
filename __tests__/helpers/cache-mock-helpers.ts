/**
 * キャッシュ関連のモックヘルパー
 * RedisCache、RedisService、CircuitBreakerのモック
 */

/**
 * RedisCacheのモックインスタンスを作成
 */
export const createRedisCacheMock = () => {
  const mock = {
    generateCacheKey: jest.fn((base: string, options: any) => {
      if (options?.params) {
        const params = options.params;
        // オブジェクトのキーをソートして一貫性のあるキーを生成
        const sortedParams = Object.keys(params)
          .sort()
          .reduce((acc: any, key) => {
            acc[key] = params[key];
            return acc;
          }, {});
        return `${base}:${JSON.stringify(sortedParams)}`;
      }
      return base;
    }),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  };
  return mock;
};

/**
 * RedisServiceのモックインスタンスを作成
 */
export const createRedisServiceMock = () => ({
  getJSON: jest.fn().mockResolvedValue(null),
  setJSON: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(false),
  clearPattern: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
});

/**
 * getRedisServiceのモック関数を作成
 */
export const createGetRedisServiceMock = () => {
  const redisServiceMock = createRedisServiceMock();
  return jest.fn().mockReturnValue(redisServiceMock);
};

/**
 * RedisClientのモックインスタンスを作成
 */
export const createRedisClientMock = () => ({
  ping: jest.fn().mockResolvedValue('PONG'),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(-1),
  keys: jest.fn().mockResolvedValue([]),
  mget: jest.fn().mockResolvedValue([]),
  mset: jest.fn().mockResolvedValue('OK'),
});

/**
 * getRedisClientのモック関数を作成
 */
export const createGetRedisClientMock = () => {
  const redisClientMock = createRedisClientMock();
  return jest.fn().mockReturnValue(redisClientMock);
};

/**
 * CircuitBreakerのモックステータスを作成
 */
export const createCircuitBreakerStats = (
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED',
  options: {
    failures?: number;
    successes?: number;
    consecutiveFailures?: number;
    lastFailureTime?: string | null;
    nextRetryTime?: string | null;
  } = {}
) => ({
  state,
  failures: options.failures ?? (state === 'OPEN' ? 10 : 0),
  successes: options.successes ?? (state === 'OPEN' ? 0 : 100),
  consecutiveFailures: options.consecutiveFailures ?? (state === 'OPEN' ? 10 : 0),
  lastFailureTime: options.lastFailureTime ?? (state === 'OPEN' ? new Date().toISOString() : null),
  nextRetryTime: options.nextRetryTime ?? (state === 'OPEN' ? new Date(Date.now() + 60000).toISOString() : null),
});

/**
 * CircuitBreakerのモックを作成
 */
export const createCircuitBreakerMock = (initialState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED') => {
  const mock = {
    getStats: jest.fn().mockReturnValue(createCircuitBreakerStats(initialState)),
    execute: jest.fn().mockResolvedValue(undefined),
    open: jest.fn(),
    close: jest.fn(),
    halfOpen: jest.fn(),
  };
  return mock;
};

/**
 * SourceCacheのモックインスタンスを作成
 */
export const createSourceCacheMock = () => ({
  getAllSourcesWithStats: jest.fn().mockResolvedValue([]),
  setAllSourcesWithStats: jest.fn().mockResolvedValue(undefined),
  getSourceById: jest.fn().mockResolvedValue(null),
  clearCache: jest.fn().mockResolvedValue(undefined),
  resolveSourceIds: jest.fn().mockResolvedValue([]),
  resolveSourceName: jest.fn().mockResolvedValue(null),
});

/**
 * グローバルモックのセットアップ
 * jest.mockの後、importの前に呼び出す
 */
export const setupGlobalCacheMocks = () => {
  const redisCacheMock = createRedisCacheMock();
  const redisServiceMock = createRedisServiceMock();
  const redisClientMock = createRedisClientMock();
  const circuitBreakerMock = createCircuitBreakerMock();
  const sourceCacheMock = createSourceCacheMock();

  // グローバルにモックを設定
  jest.mock('@/lib/cache', () => ({
    RedisCache: jest.fn().mockImplementation(() => redisCacheMock),
  }));

  jest.mock('@/lib/redis/factory', () => ({
    getRedisService: jest.fn().mockReturnValue(redisServiceMock),
  }));

  jest.mock('@/lib/redis/client', () => ({
    getRedisClient: jest.fn().mockReturnValue(redisClientMock),
  }));

  jest.mock('@/lib/cache/circuit-breaker', () => ({
    redisCircuitBreaker: circuitBreakerMock,
  }));

  jest.mock('@/lib/cache/source-cache', () => ({
    sourceCache: sourceCacheMock,
  }));

  return {
    redisCacheMock,
    redisServiceMock,
    redisClientMock,
    circuitBreakerMock,
    sourceCacheMock,
  };
};
