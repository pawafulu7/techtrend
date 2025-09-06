/**
 * Advanced caching strategies for performance optimization
 * Implements stale-while-revalidate pattern for optimal response times
 */

import { Redis } from 'ioredis';
import { log } from '@/lib/logger';

export interface CacheOptions {
  ttl: number;          // Time to live in seconds
  staleTime: number;    // Time before cache is considered stale (but still usable)
  namespace?: string;   // Cache key namespace
}

export interface CachedData<T> {
  data: T;
  timestamp: number;
  etag?: string;
}

/**
 * Aggressive cache strategy with stale-while-revalidate pattern
 * This strategy serves stale content while fetching fresh data in the background
 */
export class AggressiveCacheStrategy {
  private redis: Redis;
  private defaultOptions: CacheOptions;
  private pendingRevalidations: Map<string, Promise<void>>;

  constructor(redis: Redis, defaultOptions: Partial<CacheOptions> = {}) {
    this.redis = redis;
    this.defaultOptions = {
      ttl: 900,         // 15 minutes default
      staleTime: 300,   // 5 minutes before considered stale
      namespace: 'techtrend:cache',
      ...defaultOptions,
    };
    this.pendingRevalidations = new Map();
  }

  /**
   * Get data with stale-while-revalidate pattern
   * Returns cached data immediately if available (even if stale)
   * and triggers background refresh if needed
   */
  async getWithSWR<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: Partial<CacheOptions> = {}
  ): Promise<{ data: T; status: 'fresh' | 'stale' | 'miss' }> {
    const opts = { ...this.defaultOptions, ...options };
    const cacheKey = this.buildKey(key, opts.namespace);
    
    try {
      // Check cache
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        const parsedCache: CachedData<T> = JSON.parse(cached);
        const age = Date.now() - parsedCache.timestamp;
        
        // Fresh cache - return immediately
        if (age < opts.staleTime * 1000) {
          log.debug(`Cache hit (fresh): ${key}`);
          return {
            data: parsedCache.data,
            status: 'fresh',
          };
        }
        
        // Stale but still within TTL - return and revalidate in background
        if (age < opts.ttl * 1000) {
          log.debug(`Cache hit (stale): ${key}, revalidating in background`);
          
          // Trigger background revalidation if not already in progress
          this.revalidateInBackground(cacheKey, fetcher, opts);
          
          return {
            data: parsedCache.data,
            status: 'stale',
          };
        }
        
        // Expired - fall through to fetch fresh
        log.debug(`Cache expired: ${key}`);
      }
      
      // Cache miss or expired - fetch fresh data
      log.debug(`Cache miss: ${key}, fetching fresh data`);
      const freshData = await fetcher();
      
      // Save to cache
      await this.set(cacheKey, freshData, opts.ttl);
      
      return {
        data: freshData,
        status: 'miss',
      };
      
    } catch (error) {
      log.error('Cache error:', error);
      // On cache error, fallback to fetcher
      const data = await fetcher();
      
      // Try to save to cache, but don't fail if it doesn't work
      try {
        await this.set(cacheKey, data, opts.ttl);
      } catch (saveError) {
        log.error('Failed to save to cache:', saveError);
      }
      
      return {
        data,
        status: 'miss',
      };
    }
  }

  /**
   * Background revalidation to update stale cache
   */
  private revalidateInBackground<T>(
    cacheKey: string,
    fetcher: () => Promise<T>,
    options: CacheOptions
  ): void {
    // Check if revalidation is already in progress for this key
    if (this.pendingRevalidations.has(cacheKey)) {
      log.debug(`Revalidation already in progress for: ${cacheKey}`);
      return;
    }
    
    // Create revalidation promise
    const revalidationPromise = (async () => {
      try {
        log.debug(`Starting background revalidation for: ${cacheKey}`);
        const freshData = await fetcher();
        await this.set(cacheKey, freshData, options.ttl);
        log.debug(`Background revalidation completed for: ${cacheKey}`);
      } catch (error) {
        log.error(`Background revalidation failed for ${cacheKey}:`, error);
      } finally {
        // Clean up pending revalidation
        this.pendingRevalidations.delete(cacheKey);
      }
    })();
    
    // Track pending revalidation
    this.pendingRevalidations.set(cacheKey, revalidationPromise);
    
    // Fire and forget - don't await
    revalidationPromise.catch(() => {
      // Error already logged, just prevent unhandled rejection
    });
  }

  /**
   * Set cache with metadata
   */
  async set<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    const cacheData: CachedData<T> = {
      data,
      timestamp: Date.now(),
      etag: this.generateEtag(data),
    };
    
    await this.redis.setex(
      key,
      ttlSeconds,
      JSON.stringify(cacheData)
    );
  }

  /**
   * Warm up cache by pre-fetching data
   */
  async warmUp<T>(
    keys: Array<{ key: string; fetcher: () => Promise<T> }>,
    options: Partial<CacheOptions> = {}
  ): Promise<void> {
    const opts = { ...this.defaultOptions, ...options };
    
    log.info(`Warming up cache for ${keys.length} keys`);
    
    // Process in batches to avoid overwhelming the system
    const batchSize = 5;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async ({ key, fetcher }) => {
          try {
            const cacheKey = this.buildKey(key, opts.namespace);
            const data = await fetcher();
            await this.set(cacheKey, data, opts.ttl);
            log.debug(`Cache warmed for: ${key}`);
          } catch (error) {
            log.error(`Failed to warm cache for ${key}:`, error);
          }
        })
      );
      
      // Small delay between batches
      if (i + batchSize < keys.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    log.info('Cache warm-up completed');
  }

  /**
   * Invalidate cache for specific keys
   */
  async invalidate(keys: string | string[], namespace?: string): Promise<void> {
    const ns = namespace || this.defaultOptions.namespace;
    const keysArray = Array.isArray(keys) ? keys : [keys];
    
    const cacheKeys = keysArray.map(key => this.buildKey(key, ns));
    
    if (cacheKeys.length > 0) {
      // Use UNLINK for non-blocking deletion
      if (typeof (this.redis as any).unlink === 'function') {
        await (this.redis as any).unlink(...cacheKeys);
      } else {
        await this.redis.del(...cacheKeys);
      }
      log.debug(`Cache invalidated for ${cacheKeys.length} keys`);
    }
  }

  /**
   * Clear all cache in namespace
   */
  async clearNamespace(namespace?: string): Promise<void> {
    const ns = namespace || this.defaultOptions.namespace;
    const pattern = `${ns}:*`;
    
    // Use SCAN to avoid blocking on large datasets
    const stream = this.redis.scanStream({
      match: pattern,
      count: 100,
    });
    
    const keys: string[] = [];
    stream.on('data', (resultKeys: string[]) => {
      keys.push(...resultKeys);
    });
    
    await new Promise((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    
    if (keys.length > 0) {
      // Use pipeline with UNLINK for non-blocking deletion
      const pipeline = this.redis.pipeline();
      const batchSize = 1000;
      
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        // Prefer UNLINK for non-blocking operation
        if (typeof (this.redis as any).unlink === 'function') {
          pipeline.unlink(...batch);
        } else {
          pipeline.del(...batch);
        }
      }
      
      await pipeline.exec();
      log.info(`Cleared ${keys.length} keys from namespace: ${ns}`);
    }
  }

  /**
   * Build cache key with namespace
   */
  private buildKey(key: string, namespace?: string): string {
    const ns = namespace || this.defaultOptions.namespace;
    return `${ns}:${key}`;
  }

  /**
   * Generate simple etag for cache validation
   */
  private generateEtag<T>(data: T): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get cache statistics
   */
  async getStats(namespace?: string): Promise<{
    totalKeys: number;
    memoryUsage: number;
    oldestKey: string | null;
    newestKey: string | null;
  }> {
    const ns = namespace || this.defaultOptions.namespace;
    const pattern = `${ns}:*`;
    
    // Scan all keys in namespace
    const keys: string[] = [];
    const stream = this.redis.scanStream({
      match: pattern,
      count: 100,
    });
    
    stream.on('data', (resultKeys: string[]) => {
      keys.push(...resultKeys);
    });
    
    await new Promise((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    
    if (keys.length === 0) {
      return {
        totalKeys: 0,
        memoryUsage: 0,
        oldestKey: null,
        newestKey: null,
      };
    }
    
    // Get memory usage
    let memoryUsage = 0;
    let oldestTimestamp = Infinity;
    let newestTimestamp = 0;
    let oldestKey: string | null = null;
    let newestKey: string | null = null;
    
    for (const key of keys) {
      try {
        const data = await this.redis.get(key);
        if (data) {
          memoryUsage += Buffer.byteLength(data, 'utf8');
          
          const parsed = JSON.parse(data);
          if (parsed.timestamp) {
            if (parsed.timestamp < oldestTimestamp) {
              oldestTimestamp = parsed.timestamp;
              oldestKey = key;
            }
            if (parsed.timestamp > newestTimestamp) {
              newestTimestamp = parsed.timestamp;
              newestKey = key;
            }
          }
        }
      } catch {
        // Skip invalid entries
      }
    }
    
    return {
      totalKeys: keys.length,
      memoryUsage,
      oldestKey,
      newestKey,
    };
  }
}