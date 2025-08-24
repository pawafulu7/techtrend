/**
 * Cache Mock Factory
 * RedisMockFactoryを利用してキャッシュ機能のモックを提供
 */

import { RedisMockFactory } from './redis-mock-factory';

export class CacheMockFactory {
  private static instances = new Map<string, any>();
  
  /**
   * Cacheモックインスタンスを作成または取得
   * @param namespace キャッシュ名前空間（デフォルト: '@techtrend/cache'）
   * @param redisKey 使用するRedisモックキー（デフォルト: 'cache'）
   * @returns モックされたキャッシュインスタンス
   */
  static createMock(namespace: string = '@techtrend/cache', redisKey: string = 'cache'): any {
    const instanceKey = `${namespace}:${redisKey}`;
    
    if (!this.instances.has(instanceKey)) {
      const redisClient = RedisMockFactory.createMock(redisKey);
      
      // 統計情報の追跡
      const stats = {
        hits: 0,
        misses: 0,
        errors: 0,
        sets: 0,
        invalidations: 0,
      };
      
      const cacheMock = {
        // Redisクライアントへの参照（テスト用）
        redis: redisClient,
        
        // キャッシュ操作
        get: jest.fn().mockImplementation(async (key: string) => {
          try {
            const fullKey = `${namespace}:${key}`;
            const value = await redisClient.get(fullKey);
            
            if (value === null) {
              stats.misses++;
              return null;
            }
            
            stats.hits++;
            // JSON文字列をパース
            try {
              return JSON.parse(value);
            } catch {
              // パースできない場合はそのまま返す
              return value;
            }
          } catch (error) {
            stats.errors++;
            console.error(`Cache get error for key ${key}:`, error);
            return null;
          }
        }),
        
        set: jest.fn().mockImplementation(async (key: string, value: any, ttl?: number) => {
          try {
            const fullKey = `${namespace}:${key}`;
            const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
            
            if (ttl) {
              await redisClient.setex(fullKey, ttl, serializedValue);
            } else {
              await redisClient.set(fullKey, serializedValue);
            }
            
            stats.sets++;
          } catch (error) {
            stats.errors++;
            console.error(`Cache set error for key ${key}:`, error);
          }
        }),
        
        getOrSet: jest.fn().mockImplementation(async (
          key: string, 
          fetcher: () => Promise<any>, 
          ttl?: number
        ) => {
          const cached = await cacheMock.get(key);
          if (cached !== null) {
            return cached;
          }
          
          const value = await fetcher();
          await cacheMock.set(key, value, ttl);
          return value;
        }),
        
        invalidate: jest.fn().mockImplementation(async (pattern: string) => {
          try {
            const fullPattern = `${namespace}:${pattern}`;
            const keys = await redisClient.keys(fullPattern);
            
            if (keys.length > 0) {
              await redisClient.del(...keys);
              stats.invalidations += keys.length;
            }
          } catch (error) {
            stats.errors++;
            console.error(`Cache invalidate error for pattern ${pattern}:`, error);
          }
        }),
        
        clear: jest.fn().mockImplementation(async () => {
          try {
            const keys = await redisClient.keys(`${namespace}:*`);
            if (keys.length > 0) {
              await redisClient.del(...keys);
            }
            stats.invalidations += keys.length;
          } catch (error) {
            stats.errors++;
            console.error('Cache clear error:', error);
          }
        }),
        
        generateCacheKey: jest.fn().mockImplementation((base: string, options?: any) => {
          let key = base;
          
          if (options?.prefix) {
            key = `${options.prefix}:${key}`;
          }
          
          if (options?.params) {
            const sortedParams = Object.entries(options.params)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => `${k}=${v}`)  // 実装に合わせて配列もtoString()される
              .join(':');
            if (sortedParams) {
              key = `${key}:${sortedParams}`;
            }
          }
          
          return key;
        }),
        
        // 統計情報
        getStats: jest.fn().mockImplementation(() => ({ ...stats })),
        resetStats: jest.fn().mockImplementation(() => {
          stats.hits = 0;
          stats.misses = 0;
          stats.errors = 0;
          stats.sets = 0;
          stats.invalidations = 0;
        }),
        
        // テスト用ヘルパー
        _setMockValue: async (key: string, value: any) => {
          const fullKey = `${namespace}:${key}`;
          const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
          await redisClient.set(fullKey, serializedValue);
        },
        
        _getMockValue: async (key: string) => {
          const fullKey = `${namespace}:${key}`;
          const value = await redisClient.get(fullKey);
          if (value === null) return null;
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        },
        
        _clearAll: () => {
          // redisClient.storeがMapの場合はclear()メソッドを使用
          if (redisClient.store && typeof redisClient.store.clear === 'function') {
            redisClient.store.clear();
          }
          // flushdbメソッドがある場合は使用
          if (typeof redisClient.flushdb === 'function') {
            redisClient.flushdb();
          }
          cacheMock.resetStats();
        },
      };
      
      this.instances.set(instanceKey, cacheMock);
    }
    
    return this.instances.get(instanceKey);
  }
  
  /**
   * キャッシュモックインスタンスをリセット
   * @param namespace キャッシュ名前空間
   * @param redisKey Redisモックキー
   */
  static reset(namespace?: string, redisKey?: string): void {
    if (namespace && redisKey) {
      const instanceKey = `${namespace}:${redisKey}`;
      const instance = this.instances.get(instanceKey);
      if (instance) {
        instance._clearAll();
        // Jest関数のモック履歴をクリア
        Object.keys(instance).forEach(prop => {
          if (instance[prop]?.mockClear) {
            instance[prop].mockClear();
          }
        });
      }
    } else {
      // 全インスタンスをリセット
      this.instances.forEach(instance => {
        instance._clearAll();
        Object.keys(instance).forEach(prop => {
          if (instance[prop]?.mockClear) {
            instance[prop].mockClear();
          }
        });
      });
    }
  }
  
  /**
   * 特定のインスタンスを削除
   * @param namespace キャッシュ名前空間
   * @param redisKey Redisモックキー
   */
  static destroy(namespace: string, redisKey: string): void {
    const instanceKey = `${namespace}:${redisKey}`;
    const instance = this.instances.get(instanceKey);
    if (instance) {
      instance._clearAll();
      this.instances.delete(instanceKey);
    }
  }
  
  /**
   * 全インスタンスを削除
   */
  static destroyAll(): void {
    this.instances.forEach(instance => instance._clearAll());
    this.instances.clear();
    RedisMockFactory.destroyAll();
  }
}