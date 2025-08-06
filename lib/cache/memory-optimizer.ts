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
      console.log('[MemoryOptimizer] Monitoring already started');
      return;
    }

    console.log('[MemoryOptimizer] Starting memory monitoring...');
    
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
      console.log('[MemoryOptimizer] Monitoring stopped');
    }
  }

  /**
   * メモリ使用状況をチェック
   */
  private async checkMemoryUsage(): Promise<void> {
    try {
      const info = await this.getMemoryInfo();
      const usagePercent = (info.used / info.maxMemory) * 100;
      
      console.log(`[MemoryOptimizer] Memory usage: ${usagePercent.toFixed(2)}% (${this.formatBytes(info.used)}/${this.formatBytes(info.maxMemory)})`);
      
      // アラートレベルチェック
      if (usagePercent >= this.optimizationConfig.monitoring.criticalThreshold) {
        console.error('[MemoryOptimizer] CRITICAL: Memory usage exceeds critical threshold');
        await this.performEmergencyOptimization();
      } else if (usagePercent >= this.optimizationConfig.monitoring.alertThreshold) {
        console.warn('[MemoryOptimizer] WARNING: Memory usage exceeds alert threshold');
        await this.performOptimization();
      } else if (usagePercent >= this.maxMemoryUsagePercent) {
        console.log('[MemoryOptimizer] Memory usage high, performing optimization');
        await this.performOptimization();
      }
    } catch (error) {
      console.error('[MemoryOptimizer] Failed to check memory usage:', error);
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
    } catch (error) {
      console.error('[MemoryOptimizer] Failed to get memory info:', error);
      return { used: 0, peak: 0, maxMemory: 2 * 1024 * 1024 * 1024, fragmentation: 1 };
    }
  }

  /**
   * 通常の最適化を実行
   */
  private async performOptimization(): Promise<void> {
    console.log('[MemoryOptimizer] Performing optimization...');
    
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
    console.log('[MemoryOptimizer] Optimization completed');
  }

  /**
   * 緊急最適化を実行
   */
  private async performEmergencyOptimization(): Promise<void> {
    console.log('[MemoryOptimizer] Performing emergency optimization...');
    
    // 最も古いキーから削除
    await this.evictOldestKeys(100);
    
    // TTLを大幅に短縮
    await this.adjustTTLs(0.5); // 50%に短縮
    
    // 低優先度キャッシュをクリア
    await this.clearLowPriorityCaches();
    
    console.log('[MemoryOptimizer] Emergency optimization completed');
  }

  /**
   * TTLを調整
   */
  private async adjustTTLs(factor?: number): Promise<void> {
    const adjustmentFactor = factor || this.optimizationConfig.ttlAdjustment.adjustmentFactor;
    
    console.log(`[MemoryOptimizer] Adjusting TTLs by factor ${adjustmentFactor}`);
    
    // 各キャッシュのTTLを調整
    const currentStatsTTL = (statsCache as any).defaultTTL;
    const newStatsTTL = Math.max(
      this.optimizationConfig.ttlAdjustment.minTTL,
      Math.min(
        this.optimizationConfig.ttlAdjustment.maxTTL,
        Math.floor(currentStatsTTL * adjustmentFactor)
      )
    );
    (statsCache as any).defaultTTL = newStatsTTL;
    
    const currentTrendsTTL = (trendsCache as any).defaultTTL;
    const newTrendsTTL = Math.max(
      this.optimizationConfig.ttlAdjustment.minTTL,
      Math.min(
        this.optimizationConfig.ttlAdjustment.maxTTL,
        Math.floor(currentTrendsTTL * adjustmentFactor)
      )
    );
    (trendsCache as any).defaultTTL = newTrendsTTL;
    
    console.log(`[MemoryOptimizer] TTLs adjusted - Stats: ${newStatsTTL}s, Trends: ${newTrendsTTL}s`);
  }

  /**
   * 期限切れキーをクリーンアップ
   */
  private async cleanupExpiredKeys(): Promise<void> {
    try {
      // Redisの内部メカニズムで期限切れキーをクリーンアップ
      await this.redis.eval(
        `
        local cursor = "0"
        local count = 0
        repeat
          local result = redis.call("SCAN", cursor, "COUNT", 100)
          cursor = result[1]
          local keys = result[2]
          for i, key in ipairs(keys) do
            local ttl = redis.call("TTL", key)
            if ttl == -1 then
              -- TTLが設定されていないキーに1時間のTTLを設定
              redis.call("EXPIRE", key, 3600)
              count = count + 1
            end
          end
        until cursor == "0"
        return count
        `,
        0
      );
      
      console.log('[MemoryOptimizer] Expired keys cleanup completed');
    } catch (error) {
      console.error('[MemoryOptimizer] Failed to cleanup expired keys:', error);
    }
  }

  /**
   * 最も古いキーを削除
   */
  private async evictOldestKeys(count: number): Promise<void> {
    try {
      const script = `
        local keys = redis.call("KEYS", "*")
        local oldestKeys = {}
        
        for i = 1, math.min(#keys, ${count}) do
          table.insert(oldestKeys, keys[i])
        end
        
        for i, key in ipairs(oldestKeys) do
          redis.call("DEL", key)
        end
        
        return #oldestKeys
      `;
      
      const deleted = await this.redis.eval(script, 0);
      console.log(`[MemoryOptimizer] Evicted ${deleted} oldest keys`);
    } catch (error) {
      console.error('[MemoryOptimizer] Failed to evict oldest keys:', error);
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
        console.log(`[MemoryOptimizer] Cleared ${searchKeys.length} search cache entries`);
      }
    } catch (error) {
      console.error('[MemoryOptimizer] Failed to clear low priority caches:', error);
    }
  }

  /**
   * キャッシュ統計をリセット
   */
  private async resetCacheStats(): Promise<void> {
    statsCache.resetStats();
    trendsCache.resetStats();
    searchCache.resetStats();
    console.log('[MemoryOptimizer] Cache stats reset');
  }

  /**
   * メモリ最適化の設定を更新
   */
  updateConfig(config: Partial<typeof this.optimizationConfig>): void {
    Object.assign(this.optimizationConfig, config);
    console.log('[MemoryOptimizer] Configuration updated');
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
    console.log(`[MemoryOptimizer] Manual optimization (aggressive: ${aggressive})`);
    
    if (aggressive) {
      await this.performEmergencyOptimization();
    } else {
      await this.performOptimization();
    }
    
    const status = await this.getStatus();
    console.log('[MemoryOptimizer] Optimization result:', status.memory);
  }
}

// シングルトンインスタンス
export const memoryOptimizer = new MemoryOptimizer();