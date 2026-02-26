import { getRedisClient } from '@/lib/redis/client';
import { CacheStats, CacheKeyOptions } from './types';
import { CACHE_NAMESPACE_PREFIX } from './constants';
import logger, { hashSensitiveValue } from '@/lib/logger';

export class RedisCache {
  protected redis: ReturnType<typeof getRedisClient>;
  protected defaultTTL: number;
  protected namespace: string;
  protected stats: CacheStats = {
    hits: 0,
    misses: 0,
    errors: 0,
  };

  constructor(options?: { ttl?: number; namespace?: string }) {
    const envName = process.env.NODE_ENV || 'development';
    this.defaultTTL = options?.ttl || 300; // デフォルト5分
    this.namespace =
      options?.namespace || `${CACHE_NAMESPACE_PREFIX}:${envName}`;
    this.redis = getRedisClient();
  }

  /**
   * Generate a cache key with namespace
   */
  protected generateKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  /**
   * Generate a cache key from options
   */
  generateCacheKey(base: string, options?: CacheKeyOptions): string {
    let key = base;

    if (options?.prefix) {
      key = `${options.prefix}:${key}`;
    }

    if (options?.params) {
      const sortedParams = Object.entries(options.params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => {
          // Handle nested objects and arrays properly
          const value =
            typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
          return `${k}=${value}`;
        })
        .join(':');
      if (sortedParams) {
        key = `${key}:${sortedParams}`;
      }
    }

    return key;
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.generateKey(key);
    try {
      const value = await this.redis.get(fullKey);

      if (value === null) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return JSON.parse(value) as T;
    } catch (error) {
      this.stats.errors++;
      logger.warn(
        {
          error,
          op: 'get',
          cacheKey: hashSensitiveValue(fullKey),
          namespace: this.namespace,
        },
        'RedisCache get failed'
      );
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const fullKey = this.generateKey(key);
    // Use nullish coalescing to preserve ttl=0 as a valid value
    const finalTTL = ttl ?? this.defaultTTL;
    // Skip caching if TTL is 0 or negative
    if (finalTTL <= 0) {
      logger.warn(
        { op: 'set', cacheKey: hashSensitiveValue(fullKey), ttl: finalTTL },
        'RedisCache set skipped: non-positive TTL'
      );
      return;
    }
    try {
      // Use setex method for setting with expiration
      await this.redis.setex(fullKey, finalTTL, JSON.stringify(value));
    } catch (error) {
      this.stats.errors++;
      logger.warn(
        {
          error,
          op: 'set',
          cacheKey: hashSensitiveValue(fullKey),
          namespace: this.namespace,
          ttl: finalTTL,
        },
        'RedisCache set failed'
      );
    }
  }

  /**
   * Delete a value from cache
   * @returns true if the key was deleted, false otherwise
   */
  async delete(key: string): Promise<boolean> {
    const fullKey = this.generateKey(key);
    try {
      const deletedCount = await this.redis.del(fullKey);
      return deletedCount > 0;
    } catch (error) {
      this.stats.errors++;
      logger.warn(
        {
          error,
          op: 'delete',
          cacheKey: hashSensitiveValue(fullKey),
          namespace: this.namespace,
        },
        'RedisCache delete failed'
      );
      // Re-throw to let upstream code handle the error if needed
      throw error;
    }
  }

  /**
   * Delete a specific cache key (alias for delete method)
   * @returns true if the key was deleted, false otherwise
   */
  async del(key: string): Promise<boolean> {
    return this.delete(key);
  }

  /**
   * Invalidate cache keys matching a pattern using SCAN (non-blocking)
   */
  async invalidatePattern(pattern: string): Promise<void> {
    const fullPattern = this.generateKey(pattern);
    try {
      const keys: string[] = [];

      // Use SCAN instead of KEYS to avoid blocking
      const stream = this.redis.scanStream({
        match: fullPattern,
        count: 100, // Process 100 keys at a time
      });

      stream.on('data', (resultKeys: string[]) => {
        keys.push(...resultKeys);
      });

      await new Promise<void>((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      if (keys.length > 0) {
        // Delete keys in batches using UNLINK for non-blocking operation
        const batchSize = 1000;
        const pipeline = this.redis.pipeline();

        for (let i = 0; i < keys.length; i += batchSize) {
          const batch = keys.slice(i, i + batchSize);
          // Use UNLINK for non-blocking deletion (available in ioredis)
          pipeline.unlink(...batch);
        }

        await pipeline.exec();
      }
    } catch (error) {
      this.stats.errors++;
      logger.warn(
        {
          error,
          op: 'invalidatePattern',
          pattern: hashSensitiveValue(fullPattern),
          namespace: this.namespace,
        },
        'RedisCache invalidatePattern failed'
      );
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
    };
  }

  /**
   * 現在のデフォルトTTL（秒）を取得
   */
  getDefaultTTL(): number {
    return this.defaultTTL;
  }

  /**
   * デフォルトTTL（秒）を設定
   */
  setDefaultTTL(seconds: number): void {
    this.defaultTTL = seconds;
  }

  /**
   * Helper method to handle cache with fallback
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const fresh = await fetcher();

    // Store in cache
    await this.set(key, fresh, ttl);

    return fresh;
  }

  /**
   * Helper method to handle cache with fallback and lock (stampede protection)
   * Uses SETNX-based locking to prevent multiple concurrent fetches for the same key
   */
  async getOrSetWithLock<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const lockTTL = 30; // Lock TTL in seconds
    const maxWaitTime = 5000; // Max wait time in milliseconds
    const pollInterval = 100; // Poll interval in milliseconds

    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const lockKey = `${key}:lock`;
    const fullLockKey = this.generateKey(lockKey);

    try {
      // Try to acquire lock using SET NX EX
      const acquired = await this.redis.set(
        fullLockKey,
        '1',
        'EX',
        lockTTL,
        'NX'
      );

      if (acquired === 'OK') {
        // Lock acquired - fetch data and cache it
        try {
          const fresh = await fetcher();
          await this.set(key, fresh, ttl);
          return fresh;
        } catch (fetchError) {
          // Fetcher failed while holding lock - log and re-throw without calling fetcher again
          logger.warn(
            { error: fetchError, cacheKey: hashSensitiveValue(key) },
            'Fetcher failed while holding lock'
          );
          throw fetchError;
        } finally {
          // Release lock (best effort)
          await this.redis.del(fullLockKey).catch((err) => {
            logger.warn(
              { err, lockKey: hashSensitiveValue(fullLockKey) },
              'Failed to release lock'
            );
          });
        }
      } else {
        // Lock not acquired - poll for cached value
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitTime) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));

          const newCached = await this.get<T>(key);
          if (newCached !== null) {
            return newCached;
          }
        }

        // Timeout - fallback to direct fetch (without caching to avoid race)
        logger.warn(
          { key, maxWaitTime },
          'Lock wait timeout, falling back to direct fetch'
        );
        return await fetcher();
      }
    } catch (error) {
      // On any error, fallback to direct fetch
      logger.warn(
        { error, key },
        'getOrSetWithLock error, falling back to direct fetch'
      );
      return await fetcher();
    }
  }
}
