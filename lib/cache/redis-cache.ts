import { getRedisClient } from '@/lib/redis/client';
import { CacheOptions, CacheStats, CacheKeyOptions } from './types';

export class RedisCache {
  protected redis: ReturnType<typeof getRedisClient>;
  protected defaultTTL: number;
  protected namespace: string;
  protected stats: CacheStats = {
    hits: 0,
    misses: 0,
    errors: 0,
  };

  constructor(options?: CacheOptions) {
    this.redis = getRedisClient();
    this.defaultTTL = options?.ttl || 3600; // 1 hour default
    // Separate cache namespace per environment to avoid cross-environment bleed
    const envName = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown';
    this.namespace = options?.namespace || `@techtrend/cache:${envName}`;
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
   * Invalidate cache keys matching a pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const fullPattern = this.generateKey(pattern);
      const keys = await this.redis.keys(fullPattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (_error) {
      this.stats.errors++;
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
