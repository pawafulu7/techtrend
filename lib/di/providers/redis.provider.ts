import Redis from 'ioredis';
import { container } from '../container';
import { DI_TOKENS } from '../types';
import { env } from '@/lib/config/env';

let redisInstance: Redis | null = null;

export function registerRedisProvider(): void {
  container.registerSingleton(DI_TOKENS.REDIS, () => {
    if (!redisInstance && env.REDIS_URL) {
      redisInstance = new Redis(env.REDIS_URL, {
        // Same as lib/redis/ioredis-client.ts: keep the ioredis 5 handshake (RESP2)
        protocol: 2,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 100, 3000);
        },
      });

      redisInstance.on('error', (_err) => {});
    }
    return redisInstance;
  });
}

export function getRedisClient(): Redis | null {
  return container.get<Redis | null>(DI_TOKENS.REDIS);
}

export async function closeRedisConnection(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
}
