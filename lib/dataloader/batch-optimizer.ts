/**
 * Dynamic Batch Size Optimizer
 * codex推奨: フィードバックループによる動的バッチサイズ調整
 */

import logger from '@/lib/logger';

/**
 * バッチサイズ最適化の設定
 */
export interface BatchOptimizerConfig {
  minBatchSize: number;      // 最小バッチサイズ
  maxBatchSize: number;      // 最大バッチサイズ
  initialBatchSize: number;  // 初期バッチサイズ
  stepUp: number;           // 増加ステップ
  stepDown: number;         // 減少ステップ
  targetP95: number;        // 目標P95レイテンシ(ms)
  targetP99: number;        // 目標P99レイテンシ(ms)
  cooldownPeriod: number;   // 調整後のクールダウン期間(ms)
  sampleWindow: number;     // サンプリングウィンドウ(リクエスト数)
}

/**
 * メトリクスデータ
 */
export interface BatchMetrics {
  timestamp: number;
  batchSize: number;
  latency: number;
  queueWait: number;
  itemCount: number;
  cacheHits: number;
  cacheMisses: number;
}

/**
 * レイテンシ統計
 */
export interface LatencyStats {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  count: number;
}

/**
 * 調整履歴の型
 */
interface AdjustmentHistoryEntry {
  timestamp: number;
  oldSize: number;
  newSize: number;
  reason: string;
}

/**
 * バッチサイズ最適化エンジン
 */
export class BatchOptimizer {
  private currentBatchSize: number;
  private lastAdjustmentTime: number = 0;
  private metrics: BatchMetrics[] = [];
  private config: BatchOptimizerConfig;
  private adjustmentHistory: AdjustmentHistoryEntry[] = [];

  constructor(config: Partial<BatchOptimizerConfig> = {}) {
    this.config = {
      minBatchSize: config.minBatchSize || 10,
      maxBatchSize: config.maxBatchSize || 200,
      initialBatchSize: config.initialBatchSize || 50,
      stepUp: config.stepUp || 10,
      stepDown: config.stepDown || 20,
      targetP95: config.targetP95 || 100,  // 100ms
      targetP99: config.targetP99 || 200,  // 200ms
      cooldownPeriod: config.cooldownPeriod || 5000,  // 5秒
      sampleWindow: config.sampleWindow || 100,
    };

    this.currentBatchSize = this.config.initialBatchSize;
  }

  /**
   * メトリクスを記録
   */
  recordMetrics(metrics: Omit<BatchMetrics, 'timestamp'>): void {
    this.metrics.push({
      ...metrics,
      timestamp: Date.now(),
    });

    // ウィンドウサイズを維持
    if (this.metrics.length > this.config.sampleWindow * 2) {
      this.metrics = this.metrics.slice(-this.config.sampleWindow);
    }

    // サンプルウィンドウが満たされたら調整を検討
    if (this.metrics.length >= this.config.sampleWindow) {
      this.maybeAdjustBatchSize();
    }
  }

  /**
   * バッチサイズの調整を検討
   */
  private maybeAdjustBatchSize(): void {
    const now = Date.now();

    // クールダウン期間中はスキップ
    if (now - this.lastAdjustmentTime < this.config.cooldownPeriod) {
      return;
    }

    // レイテンシ統計を計算
    const stats = this.calculateLatencyStats();

    // キャッシュヒット率を計算
    const cacheHitRate = this.calculateCacheHitRate();

    // DB負荷を推定（キュー待ち時間ベース）
    const avgQueueWait = this.calculateAverageQueueWait();

    // 調整ロジック
    const oldSize = this.currentBatchSize;
    let newSize = oldSize;
    let reason = '';

    // codex推奨: マルチシグナル意思決定
    if (stats.p99 > this.config.targetP99) {
      // P99が目標を超過 → サイズを減らす
      newSize = Math.max(
        this.config.minBatchSize,
        oldSize - this.config.stepDown
      );
      reason = `P99 latency (${stats.p99.toFixed(1)}ms) exceeds target (${this.config.targetP99}ms)`;
    } else if (stats.p95 > this.config.targetP95) {
      // P95が目標を超過 → 少し減らす
      newSize = Math.max(
        this.config.minBatchSize,
        oldSize - Math.floor(this.config.stepDown / 2)
      );
      reason = `P95 latency (${stats.p95.toFixed(1)}ms) exceeds target (${this.config.targetP95}ms)`;
    } else if (
      stats.p95 < this.config.targetP95 * 0.5 &&
      cacheHitRate > 0.4 &&
      avgQueueWait < 10
    ) {
      // レイテンシに余裕があり、キャッシュヒット率も良好 → サイズを増やす
      newSize = Math.min(
        this.config.maxBatchSize,
        oldSize + this.config.stepUp
      );
      reason = `Headroom available: P95=${stats.p95.toFixed(1)}ms, cache=${(cacheHitRate * 100).toFixed(1)}%`;
    }

    // 比例調整（codex推奨）
    const targetDelta = this.config.targetP95 - stats.p95;
    const proportionalAdjustment = Math.floor(targetDelta * 0.1);

    if (Math.abs(proportionalAdjustment) > 5) {
      newSize = Math.max(
        this.config.minBatchSize,
        Math.min(
          this.config.maxBatchSize,
          oldSize + proportionalAdjustment
        )
      );
      reason += ` (proportional: ${proportionalAdjustment > 0 ? '+' : ''}${proportionalAdjustment})`;
    }

    // 調整を適用
    if (newSize !== oldSize) {
      this.currentBatchSize = newSize;
      this.lastAdjustmentTime = now;

      this.adjustmentHistory.push({
        timestamp: now,
        oldSize,
        newSize,
        reason,
      });

      logger.info(`batch-optimizer.adjusted: ${oldSize} → ${newSize} (${reason})`);
    }
  }

  /**
   * レイテンシ統計を計算
   */
  private calculateLatencyStats(): LatencyStats {
    const recentMetrics = this.metrics.slice(-this.config.sampleWindow);
    const latencies = recentMetrics.map(m => m.latency).sort((a, b) => a - b);

    if (latencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0, mean: 0, count: 0 };
    }

    const p50Index = Math.floor(latencies.length * 0.5);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);

    const sum = latencies.reduce((acc, val) => acc + val, 0);

    return {
      p50: latencies[p50Index],
      p95: latencies[p95Index],
      p99: latencies[p99Index],
      mean: sum / latencies.length,
      count: latencies.length,
    };
  }

  /**
   * キャッシュヒット率を計算
   */
  private calculateCacheHitRate(): number {
    const recentMetrics = this.metrics.slice(-this.config.sampleWindow);

    const totalHits = recentMetrics.reduce((acc, m) => acc + m.cacheHits, 0);
    const totalRequests = recentMetrics.reduce((acc, m) => acc + m.cacheHits + m.cacheMisses, 0);

    return totalRequests > 0 ? totalHits / totalRequests : 0;
  }

  /**
   * 平均キュー待ち時間を計算
   */
  private calculateAverageQueueWait(): number {
    const recentMetrics = this.metrics.slice(-this.config.sampleWindow);

    if (recentMetrics.length === 0) {
      return 0;
    }

    const sum = recentMetrics.reduce((acc, m) => acc + m.queueWait, 0);
    return sum / recentMetrics.length;
  }

  /**
   * 現在のバッチサイズを取得
   */
  getBatchSize(): number {
    return this.currentBatchSize;
  }

  /**
   * 統計情報を取得
   */
  getStats(): {
    currentBatchSize: number;
    latencyStats: LatencyStats;
    cacheHitRate: number;
    avgQueueWait: number;
    recentAdjustments: AdjustmentHistoryEntry[];
  } {
    return {
      currentBatchSize: this.currentBatchSize,
      latencyStats: this.calculateLatencyStats(),
      cacheHitRate: this.calculateCacheHitRate(),
      avgQueueWait: this.calculateAverageQueueWait(),
      recentAdjustments: this.adjustmentHistory.slice(-5),
    };
  }

  /**
   * リセット（テスト用）
   */
  reset(): void {
    this.currentBatchSize = this.config.initialBatchSize;
    this.lastAdjustmentTime = 0;
    this.metrics = [];
    this.adjustmentHistory = [];
  }
}

/**
 * グローバルオプティマイザーインスタンス（クエリタイプ別）
 */
const optimizers = new Map<string, BatchOptimizer>();

/**
 * クエリタイプ別のオプティマイザーを取得
 */
export function getBatchOptimizer(queryType: string): BatchOptimizer {
  if (!optimizers.has(queryType)) {
    optimizers.set(queryType, new BatchOptimizer({
      // クエリタイプ別の設定を適用可能
      ...(queryType === 'favorite' ? { targetP95: 50 } : {}),
      ...(queryType === 'view' ? { targetP95: 75 } : {}),
    }));
  }

  return optimizers.get(queryType)!;
}

/**
 * 全オプティマイザーの統計を取得
 */
export function getAllOptimizerStats(): Record<string, any> {
  const stats: Record<string, any> = {};

  optimizers.forEach((optimizer, queryType) => {
    stats[queryType] = optimizer.getStats();
  });

  return stats;
}