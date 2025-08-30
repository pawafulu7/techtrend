import { getRedisClient } from '@/lib/redis/client';
import { statsCache } from './stats-cache';
import { trendsCache } from './trends-cache';
import { searchCache } from './search-cache';

/**
 * メモリ最適化戦略実装
 * Redisメモリ使用量の監視と最適化
 */
export class MemoryOptimizer {
  private redis = getRedisClient();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly maxMemoryUsagePercent = 80; // 最大使用率80%
  private readonly checkInterval = 60000; // 1分ごとにチェック

  /**
   * メモリ最適化設定
   */
  private readonly optimizationConfig = {
    ttlAdjustment: {
      enabled: true,
      minTTL: 60,        // 最小1分
      maxTTL: 7200,      // 最大2時間
      adjustmentFactor: 0.8  // TTLを20%削減
    },
    evictionPolicy: {
      enabled: true,
      policy: 'allkeys-lru' as const,
      maxMemory: '2gb'
    },
    monitoring: {
      enabled: true,
      alertThreshold: 75,  // 75%でアラート
      criticalThreshold: 90  // 90%でクリティカル
    }
  };

  /**
   * メモリ監視を開始
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      return;
    }

    
    // 初回チェック
    this.checkMemoryUsage();
    
    // 定期チェック
    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, this.checkInterval);
  }

  /**
   * メモリ監視を停止
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * メモリ使用状況をチェック
   */
  private async checkMemoryUsage(): Promise<void> {
    try {
      const info = await this.getMemoryInfo();
      const usagePercent = (info.used / info.maxMemory) * 100;
      
      
      // アラートレベルチェック
      if (usagePercent >= this.optimizationConfig.monitoring.criticalThreshold) {
        await this.performEmergencyOptimization();
      } else if (usagePercent >= this.optimizationConfig.monitoring.alertThreshold) {
        await this.performOptimization();
      } else if (usagePercent >= this.maxMemoryUsagePercent) {
        await this.performOptimization();
      }
    } catch (_error) {
    }
  }

  /**
   * メモリ情報を取得
   */
  async getMemoryInfo(): Promise<{
    used: number;
    peak: number;
    maxMemory: number;
    fragmentation: number;
  }> {
    try {
      const info = await this.redis.info('memory');
      const lines = info.split('\r\n');
      
      let used = 0;
      let peak = 0;
      let fragmentation = 1;
      
      for (const line of lines) {
        if (line.startsWith('used_memory:')) {
          used = parseInt(line.split(':')[1]);
        } else if (line.startsWith('used_memory_peak:')) {
          peak = parseInt(line.split(':')[1]);
        } else if (line.startsWith('mem_fragmentation_ratio:')) {
          fragmentation = parseFloat(line.split(':')[1]);
        }
      }
      
      // maxmemoryの取得
      const configResult = await this.redis.config('GET', 'maxmemory');
      const maxMemory = parseInt(configResult[1]) || 2 * 1024 * 1024 * 1024; // デフォルト2GB
      
      return { used, peak, maxMemory, fragmentation };
    } catch (_error) {
      return { used: 0, peak: 0, maxMemory: 2 * 1024 * 1024 * 1024, fragmentation: 1 };
    }
  }

  /**
   * 通常の最適化を実行
   */
  private async performOptimization(): Promise<void> {
    
    const tasks: Promise<void>[] = [];
    
    // TTL調整
    if (this.optimizationConfig.ttlAdjustment.enabled) {
      tasks.push(this.adjustTTLs());
    }
    
    // 期限切れキーの削除
    tasks.push(this.cleanupExpiredKeys());
    
    // キャッシュ統計のリセット
    tasks.push(this.resetCacheStats());
    
    await Promise.allSettled(tasks);
  }

  /**
   * 緊急最適化を実行
   */
  private async performEmergencyOptimization(): Promise<void> {
    
    // 最も古いキーから削除
    await this.evictOldestKeys(100);
    
    // TTLを大幅に短縮
    await this.adjustTTLs(0.5); // 50%に短縮
    
    // 低優先度キャッシュをクリア
    await this.clearLowPriorityCaches();
    
  }

  /**
   * TTLを調整
   */
  private async adjustTTLs(factor?: number): Promise<void> {
    const adjustmentFactor = factor || this.optimizationConfig.ttlAdjustment.adjustmentFactor;
    
    
    // 各キャッシュのTTLを調整
    const currentStatsTTL = (statsCache as unknown).defaultTTL;
    const newStatsTTL = Math.max(
      this.optimizationConfig.ttlAdjustment.minTTL,
      Math.min(
        this.optimizationConfig.ttlAdjustment.maxTTL,
        Math.floor(currentStatsTTL * adjustmentFactor)
      )
    );
    (statsCache as unknown).defaultTTL = newStatsTTL;
    
    const currentTrendsTTL = (trendsCache as unknown).defaultTTL;
    const newTrendsTTL = Math.max(
      this.optimizationConfig.ttlAdjustment.minTTL,
      Math.min(
        this.optimizationConfig.ttlAdjustment.maxTTL,
        Math.floor(currentTrendsTTL * adjustmentFactor)
      )
    );
    (trendsCache as unknown).defaultTTL = newTrendsTTL;
    
  }

  /**
   * 期限切れキーをクリーンアップ
   */
  private async cleanupExpiredKeys(): Promise<void> {
    try {
      // eval使用を避けるため、通常のRedisコマンドで実装
      // SCANコマンドを使用してTTLが設定されていないキーを検出し、有効期限を設定
      let cursor = '0';
      const DEFAULT_TTL = 3600; // 1時間
      
      do {
        // SCANコマンドで100件ずつキーを取得
        const result = await this.redis.scan(cursor, 'COUNT', '100');
        cursor = result[0];
        const keys = result[1];
        
        // 各キーのTTLをチェックし、必要に応じて有効期限を設定
        for (const key of keys) {
          const ttl = await this.redis.ttl(key);
          // TTLが-1の場合は有効期限が設定されていないので設定
          if (ttl === -1) {
            await this.redis.expire(key, DEFAULT_TTL);
          }
        }
      } while (cursor !== '0');
      
    } catch (_error) {
    }
  }

  /**
   * 最も古いキーを削除
   */
  private async evictOldestKeys(count: number): Promise<void> {
    try {
      // より安全な実装：スキャンベースの削除
      let cursor = '0';
      let deletedCount = 0;
      const keysToDelete: string[] = [];
      
      // SCAN を使用して安全にキーを取得
      do {
        const result = await this.redis.scan(
          cursor,
          'COUNT',
          Math.min(100, count - deletedCount)
        );
        cursor = result[0];
        const keys = result[1];
        
        // 削除対象のキーを収集
        for (const key of keys) {
          if (deletedCount >= count) break;
          keysToDelete.push(key);
          deletedCount++;
        }
      } while (cursor !== '0' && deletedCount < count);
      
      // バッチで削除
      if (keysToDelete.length > 0) {
        await this.redis.del(...keysToDelete);
      }
    } catch (_error) {
    }
  }

  /**
   * 低優先度キャッシュをクリア
   */
  private async clearLowPriorityCaches(): Promise<void> {
    try {
      // 検索キャッシュをクリア（優先度が低い）
      const searchKeys = await this.redis.keys('@techtrend/cache:search:*');
      if (searchKeys.length > 0) {
        await this.redis.del(...searchKeys);
      }
    } catch (_error) {
    }
  }

  /**
   * キャッシュ統計をリセット
   */
  private async resetCacheStats(): Promise<void> {
    statsCache.resetStats();
    trendsCache.resetStats();
    searchCache.resetStats();
  }

  /**
   * メモリ最適化の設定を更新
   */
  updateConfig(config: Partial<typeof this.optimizationConfig>): void {
    Object.assign(this.optimizationConfig, config);
  }

  /**
   * 現在の状態を取得
   */
  async getStatus() {
    const memoryInfo = await this.getMemoryInfo();
    const usagePercent = (memoryInfo.used / memoryInfo.maxMemory) * 100;
    
    return {
      monitoring: this.monitoringInterval !== null,
      memory: {
        used: this.formatBytes(memoryInfo.used),
        peak: this.formatBytes(memoryInfo.peak),
        maxMemory: this.formatBytes(memoryInfo.maxMemory),
        usagePercent: usagePercent.toFixed(2) + '%',
        fragmentation: memoryInfo.fragmentation.toFixed(2)
      },
      config: this.optimizationConfig,
      cacheStats: {
        stats: statsCache.getStats(),
        trends: trendsCache.getStats(),
        search: searchCache.getSearchStats()
      }
    };
  }

  /**
   * バイト数をフォーマット
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 手動最適化実行
   */
  async optimizeManual(aggressive: boolean = false): Promise<void> {
    
    if (aggressive) {
      await this.performEmergencyOptimization();
    } else {
      await this.performOptimization();
    }
  }
}

// シングルトンインスタンス
export const memoryOptimizer = new MemoryOptimizer();