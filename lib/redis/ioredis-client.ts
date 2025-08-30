import Redis from 'ioredis';
import { IRedisClient, IRedisConfig } from './interfaces';

/**
 * IoRedis wrapper implementing IRedisClient interface
 */
export class IoRedisClient implements IRedisClient {
  private client: Redis;

  constructor(config?: IRedisConfig) {
    this.client = new Redis({
      host: config?.host || process.env.REDIS_HOST || 'localhost',
      port: config?.port || parseInt(process.env.REDIS_PORT || '6379'),
      password: config?.password,
      db: config?.db || 0,
      retryStrategy: config?.retryStrategy || ((times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }),
      enableOfflineQueue: config?.enableOfflineQueue !== false,
      connectTimeout: config?.connectTimeout || 10000,
      maxRetriesPerRequest: config?.maxRetriesPerRequest || 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    // Set up event handlers
    this.client.on('error', (err) => {
    });

    this.client.on('connect', () => {
    });

    this.client.on('ready', () => {
    });

    // Auto-connect
    this.client.connect().catch(() => {
    });
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