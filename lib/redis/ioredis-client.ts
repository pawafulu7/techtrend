import Redis from 'ioredis';
import { IRedisClient, IRedisConfig } from './interfaces';
import logger from '@/lib/logger';
import { env } from '@/lib/config/env';

/**
 * IoRedis wrapper implementing IRedisClient interface
 */
export class IoRedisClient implements IRedisClient {
  private client: Redis;

  constructor(config?: IRedisConfig) {
    const url = env.REDIS_URL;

    // Common options
    const commonOptions = {
      db: config?.db || 0,
      retryStrategy: config?.retryStrategy || ((times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }),
      enableOfflineQueue: config?.enableOfflineQueue !== false,
      connectTimeout: config?.connectTimeout || 10000,
      maxRetriesPerRequest: config?.maxRetriesPerRequest ?? 3,
      enableReadyCheck: true,
      lazyConnect: false,  // Connect immediately on instantiation
    } as const;

    // Prefer URL (e.g. Upstash rediss://)
    if (url) {
      const useTLS = url.startsWith('rediss://');
      this.client = new Redis(url, {
        ...commonOptions,
        // Ensure TLS on rediss schemes (some providers auto-detect, this is explicit)
        tls: useTLS ? {} : undefined,
      });
    } else {
      // Fallback to host/port/password
      this.client = new Redis({
        host: config?.host || env.REDIS_HOST || 'localhost',
        port: config?.port || parseInt(env.REDIS_PORT || '6379'),
        password: config?.password ?? env.REDIS_PASSWORD,
        ...commonOptions,
      });
    }

    // Set up event handlers
    this.client.on('error', (err) => {
      logger.warn(
        {
          error: err,
          redis: {
            hasUrl: Boolean(url),
            useTLS: Boolean(url?.startsWith('rediss://')),
            db: commonOptions.db,
          },
        },
        'Redis client error'
      );
    });

    this.client.on('connect', () => {
      logger.info(
        {
          redis: {
            hasUrl: Boolean(url),
            useTLS: Boolean(url?.startsWith('rediss://')),
            db: commonOptions.db,
          },
        },
        'Redis client connected'
      );
    });

    this.client.on('ready', () => {
      logger.info(
        {
          redis: {
            hasUrl: Boolean(url),
            useTLS: Boolean(url?.startsWith('rediss://')),
            db: commonOptions.db,
          },
        },
        'Redis client ready'
      );
    });
    // Note: With lazyConnect: false, ioredis connects automatically on instantiation
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async set(key: string, value: string): Promise<string> {
    return await this.client.set(key, value);
  }

  async setex(key: string, seconds: number, value: string): Promise<string> {
    return await this.client.setex(key, seconds, value);
  }

  async del(keys: string | string[]): Promise<number> {
    if (Array.isArray(keys)) {
      return await this.client.del(...keys);
    }
    return await this.client.del(keys);
  }

  async exists(key: string): Promise<number> {
    return await this.client.exists(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return await this.client.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return await this.client.ttl(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }

  async ping(): Promise<string> {
    return await this.client.ping();
  }

  async quit(): Promise<void> {
    await this.client.quit();
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    return await this.client.mget(...keys);
  }

  async mset(data: Record<string, string>): Promise<string> {
    const args: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      args.push(key, value);
    }
    return await this.client.mset(...args);
  }

  /**
   * Get the underlying ioredis client (for advanced operations)
   */
  getInternalClient(): Redis {
    return this.client;
  }
}
