import Redis from 'ioredis';
import { IRedisClient, IRedisConfig } from './interfaces';
import logger from '@/lib/logger';
import { env } from '@/lib/config/env';

/**
 * Redis の命令の応答を待つ上限（ms）。止まった Redis で永遠に待たないためのもので、遅い応答を
 * 失敗に変えるためのものではない。ioredis は接続中に待たされた命令にもこの上限を数える
 * （Redis.js の sendCommand）ので、冷えた関数の最初の接続（TLS を含む）に余裕を持たせる。
 * レート制限は Redis の失敗で既定ではリクエストを通さない（with-rate-limit.ts）ので、短くしすぎない。
 * キャッシュの取得（get → ロックの set）は止まると2命令分待つ
 */
export const REDIS_COMMAND_TIMEOUT_MS = 3000;

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
      retryStrategy:
        config?.retryStrategy ||
        ((times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        }),
      enableOfflineQueue: config?.enableOfflineQueue !== false,
      connectTimeout: config?.connectTimeout || 10000,
      // 接続が生きたまま応答が止まると、命令は既定では永遠に待つ（ホームの表示がソース・タグの
      // 取得で止まる）。上限を過ぎたら失敗にし、キャッシュの読み書きは DB への直接の取得に切り替える
      commandTimeout: config?.commandTimeout ?? REDIS_COMMAND_TIMEOUT_MS,
      maxRetriesPerRequest: config?.maxRetriesPerRequest ?? 3,
      enableReadyCheck: true,
      lazyConnect: false, // Connect immediately on instantiation
      // ioredis 6 defaults to RESP3 and only falls back to RESP2 on NOPROTO /
      // unknown HELLO. Pin RESP2 so the handshake stays the same as ioredis 5
      // regardless of how the hosted Redis answers HELLO 3.
      protocol: 2,
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
        port: config?.port || parseInt(env.REDIS_PORT),
        password: config?.password ?? env.REDIS_PASSWORD,
        ...commonOptions,
      });
    }

    // Set up event handlers
    this.client.on('error', (err) => {
      logger.warn(
        {
          err: err,
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
