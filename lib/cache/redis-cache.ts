import { getRedisClient } from '@/lib/redis/client';
import { CacheStats, CacheKeyOptions } from './types';
import type { Redis } from 'ioredis';
import { CACHE_NAMESPACE_PREFIX } from './constants';

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
    this.namespace = options?.namespace || `${CACHE_NAMESPACE_PREFIX}:${envName}`;
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
          const value = typeof v === 'object' && v !== null
            ? JSON.stringify(v)
            : String(v);
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
    try {
      const fullKey = this.generateKey(key);
      const value = await this.redis.get(fullKey);
      
      if (value === null) {
        this.stats.misses++;
        return null;
      }
      
      this.stats.hits++;
      return JSON.parse(value) as T;
    } catch (_error) {
      this.stats.errors++;
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    try {
      const fullKey = this.generateKey(key);
      const finalTTL = ttl || this.defaultTTL;
      
      // Use setex method for setting with expiration
      await this.redis.setex(
        fullKey,
        finalTTL,
        JSON.stringify(value)
      );
    } catch (_error) {
      this.stats.errors++;
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<void> {
    try {
      const fullKey = this.generateKey(key);
      await this.redis.del(fullKey);
    } catch (_error) {
      this.stats.errors++;
    }
  }

  /**
   * Delete a specific cache key
   */
  async del(key: string): Promise<void> {
    try {
      const fullKey = this.generateKey(key);
      await this.redis.del(fullKey);
    } catch (_error) {
      this.stats.errors++;
    }
  }

  /**
   * Invalidate cache keys matching a pattern using SCAN (non-blocking)
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const fullPattern = this.generateKey(pattern);
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
          // Use UNLINK if available for non-blocking deletion
          if ('unlink' in this.redis && typeof (this.redis as Redis & { unlink?: (...keys: string[]) => Promise<number> }).unlink === 'function') {
            pipeline.unlink(...batch);
          } else {
            pipeline.del(...batch);
          }
        }
        
        await pipeline.exec();
      }
    } catch (_error) {
      this.stats.errors++;
    }
  }

  /**
   * Delete all keys matching a pattern using SCAN and batch deletion
   * This method allows direct pattern matching without namespace prefix
   * @param pattern - The pattern to match (e.g., 'related:articleId:*')
   * @param batchSize - Number of keys to delete in each batch (default: 500)
   */
  async deleteByPattern(pattern: string, batchSize: number = 500): Promise<number> {
    try {
      const fullPattern = this.generateKey(pattern);
      const keys: string[] = [];
      
      // Use SCAN to find all matching keys
      const stream = this.redis.scanStream({
        match: fullPattern,
        count: 100, // Scan 100 keys at a time
      });
      
      stream.on('data', (resultKeys: string[]) => {
        keys.push(...resultKeys);
      });
      
      await new Promise<void>((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      
      if (keys.length === 0) {
        return 0;
      }
      
      // Delete keys in batches using pipeline
      const pipeline = this.redis.pipeline();
      let deletedCount = 0;
      
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        
        // Prefer UNLINK for non-blocking deletion
        if ('unlink' in this.redis && typeof (this.redis as Redis & { unlink?: (...keys: string[]) => Promise<number> }).unlink === 'function') {
          pipeline.unlink(...batch);
        } else {
          pipeline.del(...batch);
        }
        
        deletedCount += batch.length;
      }
      
      await pipeline.exec();
      return deletedCount;
      
    } catch (error) {
      this.stats.errors++;
      throw error;
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
}
