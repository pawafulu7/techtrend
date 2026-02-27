import { getRedisClient } from '@/lib/redis/client';
import { statsCache } from './stats-cache';
import { trendsCache } from './trends-cache';
import { searchCache } from './search-cache';
import { CACHE_NAMESPACE_PREFIX } from './constants';
import logger from '@/lib/logger';
import { safeUnlink } from '@/lib/types/redis';

/**
 * メモリ最適化戦略実装
 * Redisメモリ使用量の監視と最適化
 */
export class MemoryOptimizer {
  private redis = getRedisClient();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isChecking = false; // Guard against concurrent checks
  private readonly checkInterval = 60000; // 1分ごとにチェック

  /**
   * メモリ最適化設定
   */
  private readonly optimizationConfig = {
    ttlAdjustment: {
      enabled: true,
      minTTL: 60, // 最小1分
      maxTTL: 7200, // 最大2時間
      adjustmentFactor: 0.8, // TTLを20%削減
    },
    evictionPolicy: {
      enabled: true,
      policy: 'allkeys-lru' as const,
      maxMemory: '2gb',
    },
    monitoring: {
      enabled: true,
      alertThreshold: 75, // 75%でアラート
      criticalThreshold: 90, // 90%でクリティカル
    },
  };

  // TTL baseline tracking for recovery mechanism
  private ttlBaselines: Map<string, number> = new Map();
  private ttlBaselineInitialized = false;
  private readonly recoveryThreshold = 65; // Start recovery below 65% (hysteresis with 75% alert)
  private readonly recoveryStepFraction = 0.2; // Recover 20% toward baseline per cycle

  /**
   * ネームスペースパターンを生成
   */
  private ns(pattern: string): string {
    return `${CACHE_NAMESPACE_PREFIX}:${pattern}`;
  }

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
   * TTLベースラインを初期化
   */
  private initializeTTLBaselines(): void {
    if (this.ttlBaselineInitialized) return;
    if (!this.ttlBaselines.has('stats')) {
      this.ttlBaselines.set('stats', statsCache.getDefaultTTL());
    }
    if (!this.ttlBaselines.has('trends')) {
      this.ttlBaselines.set('trends', trendsCache.getDefaultTTL());
    }
    this.ttlBaselineInitialized = true;
  }

  /**
   * メモリ使用状況をチェック
   */
  private async checkMemoryUsage(): Promise<void> {
    // Prevent concurrent checks
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      this.initializeTTLBaselines();
      const info = await this.getMemoryInfo();
      const usagePercent = (info.used / info.maxMemory) * 100;

      // アラートレベルチェック (simplified condition)
      if (
        usagePercent >= this.optimizationConfig.monitoring.criticalThreshold
      ) {
        await this.performEmergencyOptimization();
      } else if (
        usagePercent >= this.optimizationConfig.monitoring.alertThreshold
      ) {
        await this.performOptimization();
      } else if (usagePercent < this.recoveryThreshold) {
        // Memory pressure relieved - start recovering TTLs
        await this.restoreTTLs();
      }
    } catch (error) {
      // 最小限の可観測性を確保
      logger.debug({ error }, '[MemoryOptimizer] checkMemoryUsage failed');
    } finally {
      this.isChecking = false;
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
      const cfg = configResult as unknown as string[];
      const maxMemory = parseInt(cfg?.[1] ?? '0') || 2 * 1024 * 1024 * 1024; // デフォルト2GB

      return { used, peak, maxMemory, fragmentation };
    } catch (_error) {
      return {
        used: 0,
        peak: 0,
        maxMemory: 2 * 1024 * 1024 * 1024,
        fragmentation: 1,
      };
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
   * TTLを調整（ベースライン基準で計算し、ratchet-downを防止）
   */
  private async adjustTTLs(factor?: number): Promise<void> {
    this.initializeTTLBaselines();
    const adjustmentFactor =
      factor ?? this.optimizationConfig.ttlAdjustment.adjustmentFactor;

    // ベースライン基準でTTLを調整（current値ではなくbaseline * factorで計算）
    const statsBaseline =
      this.ttlBaselines.get('stats') ?? statsCache.getDefaultTTL();
    const newStatsTTL = Math.max(
      this.optimizationConfig.ttlAdjustment.minTTL,
      Math.min(
        this.optimizationConfig.ttlAdjustment.maxTTL,
        Math.floor(statsBaseline * adjustmentFactor)
      )
    );
    statsCache.setDefaultTTL(newStatsTTL);

    const trendsBaseline =
      this.ttlBaselines.get('trends') ?? trendsCache.getDefaultTTL();
    const newTrendsTTL = Math.max(
      this.optimizationConfig.ttlAdjustment.minTTL,
      Math.min(
        this.optimizationConfig.ttlAdjustment.maxTTL,
        Math.floor(trendsBaseline * adjustmentFactor)
      )
    );
    trendsCache.setDefaultTTL(newTrendsTTL);
  }

  /**
   * TTLをベースラインに向けて段階的に回復
   */
  private restoreTTLs(): void {
    for (const [name, baseline] of this.ttlBaselines) {
      let cache: { getDefaultTTL(): number; setDefaultTTL(n: number): void };
      if (name === 'stats') cache = statsCache;
      else if (name === 'trends') cache = trendsCache;
      else continue;

      const current = cache.getDefaultTTL();
      if (current >= baseline) continue;

      // Step toward baseline by recoveryStepFraction
      const step = Math.ceil((baseline - current) * this.recoveryStepFraction);
      const newTTL = Math.min(baseline, current + step);
      cache.setDefaultTTL(newTTL);
    }
  }

  /**
   * TTLベースラインを更新（外部からsetCustomTTL使用時に呼び出し）
   */
  updateBaseline(name: string, ttl: number): void {
    this.ttlBaselines.set(name, ttl);
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
        // SCANコマンドで100件ずつキーを取得（ネームスペース限定）
        const result = await this.redis.scan(
          cursor,
          'MATCH',
          this.ns('*'),
          'COUNT',
          100 // 数値型で渡す
        );
        cursor = result[0];
        const keys = result[1];

        // 1) TTLをまとめて取得
        const ttlPipe = this.redis.pipeline();
        for (const key of keys) ttlPipe.ttl(key);
        const ttlResults = await ttlPipe.exec();

        // 2) TTLが -1 のキーだけ EXPIRE をまとめて設定
        // -2: key does not exist, -1: no expire set
        const expirePipe = this.redis.pipeline();
        ttlResults?.forEach((res, idx) => {
          const [err, ttl] = res as [Error | null, number];
          if (!err && ttl === -1) {
            expirePipe.expire(keys[idx], DEFAULT_TTL);
          }
        });
        await expirePipe.exec();
      } while (cursor !== '0');
    } catch (error) {
      logger.debug({ error }, '[MemoryOptimizer] cleanupExpiredKeys failed');
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

      // SCAN を使用して安全にキーを取得（ネームスペース限定）
      do {
        const result = await this.redis.scan(
          cursor,
          'MATCH',
          this.ns('*'),
          'COUNT',
          Math.min(200, Math.max(50, count - deletedCount))
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

      // バッチで削除（UNLINK優先、大量キー対応）
      if (keysToDelete.length > 0) {
        const batchSize = 1000;
        for (let i = 0; i < keysToDelete.length; i += batchSize) {
          const batch = keysToDelete.slice(i, i + batchSize);
          await safeUnlink(this.redis, ...batch);
        }
      }
    } catch (error) {
      logger.debug({ error }, '[MemoryOptimizer] evictOldestKeys failed');
    }
  }

  /**
   * 低優先度キャッシュをクリア using SCAN (non-blocking)
   */
  private async clearLowPriorityCaches(): Promise<void> {
    try {
      // 検索キャッシュをクリア（優先度が低い）
      let cursor = '0';

      // Use SCAN with immediate deletion to avoid memory buildup
      do {
        const result = await this.redis.scan(
          cursor,
          'MATCH',
          this.ns('search:*'),
          'COUNT',
          500 // Process in larger chunks for efficiency
        );
        cursor = result[0];
        const keys = result[1] as string[];

        // Delete keys in batches immediately
        if (keys.length > 0) {
          const batchSize = 1000;
          for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            // Use safeUnlink for type-safe non-blocking operation
            await safeUnlink(this.redis, ...batch);
          }
        }
      } while (cursor !== '0');
    } catch (error) {
      logger.debug(
        { error },
        '[MemoryOptimizer] clearLowPriorityCaches failed'
      );
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
        fragmentation: memoryInfo.fragmentation.toFixed(2),
      },
      config: this.optimizationConfig,
      cacheStats: {
        stats: statsCache.getStats(),
        trends: trendsCache.getStats(),
        search: searchCache.getSearchStats(),
      },
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
