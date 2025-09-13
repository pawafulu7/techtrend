/**
 * Enhanced Redis cache with stale-while-revalidate support
 * Extends the base RedisCache with advanced caching strategies
 */

import { RedisCache } from './redis-cache';
import { AggressiveCacheStrategy } from './strategies';
import { CacheOptions, CacheStats } from './types';
import { getRedisClient } from '@/lib/redis/client';
import logger from '@/lib/logger';

export interface EnhancedCacheOptions extends CacheOptions {
  staleTime?: number;      // Time before cache is considered stale (seconds)
  enableSWR?: boolean;      // Enable stale-while-revalidate
  warmupKeys?: string[];    // Keys to pre-warm on initialization
}

/**
 * Enhanced Redis cache with performance optimizations
 */
export class EnhancedRedisCache extends RedisCache {
  private strategy: AggressiveCacheStrategy;
  private options: EnhancedCacheOptions;

  constructor(options?: EnhancedCacheOptions) {
    super(options);
    
    this.options = {
      ttl: 3600,             // 1 hour default (increased from 15 minutes)
      staleTime: 600,        // 10 minutes before stale (increased from 5)
      enableSWR: true,       // Enable SWR by default
      ...options,
    };
    
    // Initialize aggressive cache strategy
    this.strategy = new AggressiveCacheStrategy(getRedisClient(), {
      ttl: this.options.ttl,
      staleTime: this.options.staleTime,
      namespace: this.namespace,
    });
    
    // Warm up cache if keys provided
    if (this.options.warmupKeys?.length) {
      this.warmupCache();
    }
  }

  /**
   * Get with stale-while-revalidate support
   * Falls back to regular get if SWR is disabled
   */
  async getWithSWR<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T | null> {
    if (!this.options.enableSWR) {
      // Fallback to regular cache behavior
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }
      
      const fresh = await fetcher();
      await this.set(key, fresh, ttl);
      return fresh;
    }
    
    // Use SWR strategy
    const result = await this.strategy.getWithSWR(
      key,
      fetcher,
      {
        ttl: ttl || this.options.ttl,
        staleTime: this.options.staleTime,
      }
    );
    
    // Update stats based on status
    switch (result.status) {
      case 'fresh':
        this.stats.hits++;
        break;
      case 'stale':
        this.stats.hits++; // Still a hit, just stale
        // logger.debug(`Serving stale content for key: ${key}`);
        break;
      case 'miss':
        this.stats.misses++;
        break;
    }
    
    return result.data;
  }

  /**
   * Optimized get method with optional SWR
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options?: {
      ttl?: number;
      forceFetch?: boolean;
      useSWR?: boolean;
    }
  ): Promise<T> {
    // Force fetch if requested
    if (options?.forceFetch) {
      const fresh = await fetcher();
      await this.set(key, fresh, options.ttl);
      return fresh;
    }
    
    // Use SWR if enabled and requested
    if (this.options.enableSWR && options?.useSWR !== false) {
      const result = await this.getWithSWR(key, fetcher, options?.ttl);
      return result as T;
    }
    
    // Regular cache behavior
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    
    const fresh = await fetcher();
    await this.set(key, fresh, options?.ttl);
    return fresh;
  }

  /**
   * Batch get with parallel fetching
   */
  async getBatch<T>(
    keys: string[]
  ): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();
    
    // Fetch all keys in parallel
    const promises = keys.map(async key => {
      const value = await this.get<T>(key);
      return { key, value };
    });
    
    const batchResults = await Promise.all(promises);
    
    for (const { key, value } of batchResults) {
      results.set(key, value);
    }
    
    return results;
  }

  /**
   * Batch set with parallel writing
   */
  async setBatch<T>(
    items: Array<{ key: string; value: T; ttl?: number }>
  ): Promise<void> {
    const promises = items.map(({ key, value, ttl }) =>
      this.set(key, value, ttl)
    );
    
    await Promise.all(promises);
  }

  /**
   * Invalidate cache with pattern matching using SCAN (non-blocking)
   */
  async invalidatePattern(pattern: string): Promise<void> {
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
    
    if (keys.length === 0) {
      return;
    }
    
    // Delete keys in batches to avoid command too long
    const batchSize = 1000;
    let deleted = 0;
    
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      const result = await this.redis.del(...batch);
      deleted += result;
    }
    
    logger.info(`Invalidated ${deleted} cache keys matching pattern: ${pattern}`);
  }

  /**
   * Pre-warm cache for common queries
   */
  private async warmupCache(): Promise<void> {
    if (!this.options.warmupKeys?.length) {
      return;
    }
    
    logger.info(`Starting cache warmup for ${this.options.warmupKeys.length} keys`);
    
    // This would need to be implemented based on specific warmup logic
    // For now, just log the intent
    for (const key of this.options.warmupKeys) {
      // logger.debug(`Would warm up key: ${key}`);
    }
  }

  /**
   * Get cache statistics
   */
  async getDetailedStats(): Promise<{
    basic: CacheStats;
    hitRate: number;
    cacheSize: number;
    memoryUsage: number;
  }> {
    const advancedStats = await this.strategy.getStats();
    
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 
      ? (this.stats.hits / totalRequests) * 100 
      : 0;
    
    return {
      basic: this.stats,
      hitRate,
      cacheSize: advancedStats.totalKeys,
      memoryUsage: advancedStats.memoryUsage,
    };
  }

  /**
   * Clear all cache (use with caution)
   */
  async clearAll(): Promise<void> {
    await this.strategy.clearNamespace();
    
    // Reset stats
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
    };
  }
}