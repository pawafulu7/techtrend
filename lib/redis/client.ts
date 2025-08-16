import Redis from 'ioredis';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    // Test environment: Return mock object
    if (process.env.NODE_ENV === 'test') {
      redisClient = {
        get: jest?.fn() || (() => Promise.resolve(null)),
        set: jest?.fn() || (() => Promise.resolve('OK')),
        del: jest?.fn() || (() => Promise.resolve(1)),
        exists: jest?.fn() || (() => Promise.resolve(0)),
        expire: jest?.fn() || (() => Promise.resolve(1)),
        ttl: jest?.fn() || (() => Promise.resolve(-2)),
        keys: jest?.fn() || (() => Promise.resolve([])),
        setex: jest?.fn() || (() => Promise.resolve('OK')),
        on: jest?.fn() || (() => {}),
        once: jest?.fn() || (() => {}),
        off: jest?.fn() || (() => {}),
        emit: jest?.fn() || (() => {}),
        connect: jest?.fn() || (() => Promise.resolve()),
        disconnect: jest?.fn() || (() => Promise.resolve()),
        quit: jest?.fn() || (() => Promise.resolve()),
        ping: jest?.fn() || (() => Promise.resolve('PONG')),
      } as any as Redis;
    } else {
      // Production environment: Create real Redis client
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