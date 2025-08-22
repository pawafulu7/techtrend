/**
 * Mock for @/lib/cache/redis-cache
 * CacheMockFactoryを使用した統一されたモック実装
 */

import { CacheMockFactory } from '@/test/factories/cache-mock-factory';

// グローバルなキャッシュモックインスタンス
export const cache = CacheMockFactory.createMock();

export class RedisCache {
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
  invalidate = (pattern: string) => this.mockInstance.invalidate(pattern);
  clear = () => this.mockInstance.clear();
  generateCacheKey = (base: string, options?: any) => 
    this.mockInstance.generateCacheKey(base, options);
  getStats = () => this.mockInstance.getStats();
  resetStats = () => this.mockInstance.resetStats();
}

// beforeEachフックでモックをリセット
beforeEach(() => {
  CacheMockFactory.reset();
});