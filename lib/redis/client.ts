import Redis from 'ioredis';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    // Test environment: Use mocked ioredis if available
    if (process.env.NODE_ENV === 'test') {
      try {
        // jest.mockされたioredisを使用
        const Redis = require('ioredis');
        redisClient = new Redis();
      } catch (error) {
        // フォールバック: モックオブジェクトを直接作成
        redisClient = {
          ping: (typeof jest !== 'undefined' && jest.fn) ? jest.fn().mockResolvedValue('PONG') : (() => Promise.resolve('PONG')),
          set: (typeof jest !== 'undefined' && jest.fn) ? jest.fn().mockResolvedValue('OK') : (() => Promise.resolve('OK')),
          get: (typeof jest !== 'undefined' && jest.fn) ? jest.fn().mockResolvedValue(null) : (() => Promise.resolve(null)),
          del: (typeof jest !== 'undefined' && jest.fn) ? jest.fn().mockResolvedValue(1) : (() => Promise.resolve(1)),
          exists: (typeof jest !== 'undefined' && jest.fn) ? jest.fn().mockResolvedValue(0) : (() => Promise.resolve(0)),
          expire: (typeof jest !== 'undefined' && jest.fn) ? jest.fn().mockResolvedValue(1) : (() => Promise.resolve(1)),
          ttl: (typeof jest !== 'undefined' && jest.fn) ? jest.fn().mockResolvedValue(59) : (() => Promise.resolve(59)),
          keys: (typeof jest !== 'undefined' && jest.fn) ? jest.fn().mockResolvedValue([]) : (() => Promise.resolve([])),
          setex: (typeof jest !== 'undefined' && jest.fn) ? jest.fn().mockResolvedValue('OK') : (() => Promise.resolve('OK')),
          on: (typeof jest !== 'undefined' && jest.fn) ? jest.fn() : (() => {}),
          once: (typeof jest !== 'undefined' && jest.fn) ? jest.fn() : (() => {}),
          off: (typeof jest !== 'undefined' && jest.fn) ? jest.fn() : (() => {}),
          emit: (typeof jest !== 'undefined' && jest.fn) ? jest.fn() : (() => false),
          connect: (typeof jest !== 'undefined' && jest.fn) ? jest.fn().mockResolvedValue(undefined) : (() => Promise.resolve()),
          disconnect: (typeof jest !== 'undefined' && jest.fn) ? jest.fn().mockResolvedValue(undefined) : (() => Promise.resolve()),
          quit: (typeof jest !== 'undefined' && jest.fn) ? jest.fn().mockResolvedValue(undefined) : (() => Promise.resolve()),
        } as any as Redis;
      }
    } else {
      // Production environment: Create real Redis client
      const Redis = require('ioredis');
      redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });

      redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });

      redisClient.on('connect', () => {
        console.log('Redis Client Connected');
      });

      redisClient.on('ready', () => {
        console.log('Redis Client Ready');
      });
      
      // Actually connect since lazyConnect is true
      redisClient.connect().catch(err => {
        console.error('Redis connection failed:', err);
      });
    }
  }

  return redisClient;
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

// Export redis instance for backward compatibility with tests
// Use lazy initialization to avoid immediate execution
export const redis = (() => {
  let _instance: Redis | null = null;
  return new Proxy({} as Redis, {
    get(target, prop) {
      if (!_instance) {
        _instance = getRedisClient();
      }
      return (_instance as any)[prop];
    }
  });
})();