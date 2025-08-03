import { Redis } from '@upstash/redis';
import { CacheOptions, CacheKeyOptions } from './types';

export class RedisCache {
  private redis: Redis;
  private defaultTTL: number;
  private namespace: string;
  private stats = {
    hits: 0,
    misses: 0,
    errors: 0,
  };

  constructor(redis: Redis, options?: CacheOptions) {
    this.redis = redis;
    this.defaultTTL = options?.ttl || 3600; // 1 hour default
    this.namespace = options?.namespace || '@techtrend/cache';
  }

  /**
   * Generate a cache key with namespace
   */
  private generateKey(key: string): string {
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
        .map(([k, v]) => `${k}=${v}`)
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
      return value as T;
    } catch (error) {
      this.stats.errors++;
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const fullKey = this.generateKey(key);
      const finalTTL = ttl || this.defaultTTL;
      
      await this.redis.set(fullKey, JSON.stringify(value), {
        ex: finalTTL,
      });
    } catch (error) {
      this.stats.errors++;
      console.error(`Cache set error for key ${key}:`, error);
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<void> {
    try {
      const fullKey = this.generateKey(key);
      await this.redis.del(fullKey);
    } catch (error) {
      this.stats.errors++;
      console.error(`Cache delete error for key ${key}:`, error);
    }
  }

  /**
   * Invalidate cache keys matching a pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const fullPattern = this.generateKey(pattern);
      // Note: Upstash Redis doesn't support SCAN command in the same way
      // For now, we'll need to track keys manually or use specific invalidation
      console.warn(`Pattern invalidation not fully supported with Upstash. Pattern: ${fullPattern}`);
    } catch (error) {
      this.stats.errors++;
      console.error(`Cache invalidation error for pattern ${pattern}:`, error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset cache statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
    };
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