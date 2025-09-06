/**
 * Mock for @/lib/cache/enhanced-redis-cache
 * CacheMockFactoryを使用した統一されたモック実装
 */

import { CacheMockFactory } from '@/test/factories/cache-mock-factory';

// グローバルなキャッシュモックインスタンス
export const cache = CacheMockFactory.createMock();

export class EnhancedRedisCache {
  private mockInstance: any;
  
  constructor(options?: any) {
    // 各インスタンスで独自のモックを作成することも可能
    const namespace = options?.namespace || '@techtrend/cache';
    this.mockInstance = options?.useShared === false 
      ? CacheMockFactory.createMock(namespace, `instance-${Date.now()}`)
      : cache;
  }
  
  get = (key: string) => this.mockInstance.get(key);
  set = (key: string, value: any, ttl?: number) => this.mockInstance.set(key, value, ttl);
  getOrSet = (key: string, fetcher: () => Promise<any>, ttl?: number) => 
    this.mockInstance.getOrSet(key, fetcher, ttl);
  getOrFetch = (key: string, fetcher: () => Promise<any>, options?: any) => 
    this.mockInstance.getOrSet(key, fetcher, options?.ttl);
  getWithSWR = (key: string, fetcher: () => Promise<any>, ttl?: number) => 
    this.mockInstance.getOrSet(key, fetcher, ttl);
  invalidate = (pattern: string) => this.mockInstance.invalidate(pattern);
  invalidatePattern = (pattern: string) => this.mockInstance.invalidate(pattern);
  clear = () => this.mockInstance.clear();
  clearAll = () => this.mockInstance.clear();
  generateCacheKey = (base: string, options?: any) => 
    this.mockInstance.generateCacheKey(base, options);
  generateKey = (key: string) => `${this.mockInstance.namespace}:${key}`;
  getStats = () => this.mockInstance.getStats();
  getDetailedStats = () => Promise.resolve({
    basic: this.mockInstance.getStats(),
    hitRate: 0,
    cacheSize: 0,
    memoryUsage: 0,
  });
  resetStats = () => this.mockInstance.resetStats();
  getBatch = (keys: string[]) => Promise.resolve(new Map());
  setBatch = (items: any[]) => Promise.resolve();
}

// デフォルトのインスタンスをエクスポート
export const enhancedCache = cache;

// Note: モックのリセットは各テストファイルのbeforeEachで行う