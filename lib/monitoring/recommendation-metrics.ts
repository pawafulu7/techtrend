import logger from '@/lib/logger';

/**
 * リングバッファの実装
 */
class RingBuffer {
  private buffer: number[];
  private writeIndex: number = 0;
  private isFull: boolean = false;
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
    this.buffer = new Array(maxSize);
  }

  push(value: number): void {
    this.buffer[this.writeIndex] = value;
    this.writeIndex = (this.writeIndex + 1) % this.maxSize;
    if (this.writeIndex === 0) {
      this.isFull = true;
    }
  }

  getValues(): number[] {
    if (!this.isFull && this.writeIndex === 0) {
      return [];
    }
    if (!this.isFull) {
      return this.buffer.slice(0, this.writeIndex);
    }
    // フルの場合は、writeIndexから最後まで + 最初からwriteIndexまでの順で返す
    return [...this.buffer.slice(this.writeIndex), ...this.buffer.slice(0, this.writeIndex)];
  }

  size(): number {
    return this.isFull ? this.maxSize : this.writeIndex;
  }

  clear(): void {
    this.writeIndex = 0;
    this.isFull = false;
  }
}

/**
 * 推薦システムのメトリクス収集と分析
 */
export class RecommendationMetrics {
  private static instance: RecommendationMetrics;
  private metrics: Map<string, RingBuffer> = new Map();
  private counters: Map<string, number> = new Map();
  private startTime: number = Date.now();
  private readonly MAX_METRICS_SIZE = 1000; // リングバッファの最大サイズ

  private constructor() {}

  static getInstance(): RecommendationMetrics {
    if (!RecommendationMetrics.instance) {
      RecommendationMetrics.instance = new RecommendationMetrics();
    }
    return RecommendationMetrics.instance;
  }

  /**
   * 応答時間を記録
   */
  recordResponseTime(operation: string, duration: number): void {
    const key = `response_time:${operation}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, new RingBuffer(this.MAX_METRICS_SIZE));
    }
    const buffer = this.metrics.get(key)!;
    buffer.push(duration);

    // 100回ごとに統計をログ出力
    if (buffer.size() % 100 === 0) {
      this.logStatistics(key);
    }
  }

  /**
   * カウンターをインクリメント
   */
  incrementCounter(name: string, value: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  /**
   * キャッシュヒット率を記録
   */
  recordCacheHit(hit: boolean): void {
    this.incrementCounter(hit ? 'cache:hits' : 'cache:misses');
  }

  /**
   * DBクエリ数を記録
   */
  recordDatabaseQuery(queryType: string): void {
    this.incrementCounter(`db:${queryType}`);
    this.incrementCounter('db:total');
  }

  /**
   * バッチサイズを記録
   */
  recordBatchSize(size: number): void {
    const key = 'batch:sizes';
    if (!this.metrics.has(key)) {
      this.metrics.set(key, new RingBuffer(this.MAX_METRICS_SIZE));
    }
    this.metrics.get(key)!.push(size);
  }

  /**
   * 統計情報をログ出力
   */
  private logStatistics(key: string): void {
    const buffer = this.metrics.get(key);
    if (!buffer) return;

    const values = buffer.getValues();
    if (values.length === 0) return;

    const sorted = [...values].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    logger.info({
      metric: key,
      count: values.length,
      avg: avg.toFixed(2),
      p50: p50.toFixed(2),
      p95: p95.toFixed(2),
      p99: p99.toFixed(2),
    });
  }

  /**
   * 全メトリクスをクリア
   */
  reset(): void {
    this.metrics.clear();
    this.counters.clear();
    this.startTime = Date.now();
  }

  /**
   * 現在のメトリクスサマリーを取得
   */
  getSummary(): Record<string, any> {
    const uptime = Date.now() - this.startTime;
    const cacheHits = this.counters.get('cache:hits') || 0;
    const cacheMisses = this.counters.get('cache:misses') || 0;
    const totalCacheRequests = cacheHits + cacheMisses;
    const cacheHitRate = totalCacheRequests > 0
      ? (cacheHits / totalCacheRequests * 100).toFixed(2)
      : '0.00';

    const dbTotal = this.counters.get('db:total') || 0;
    const requestBuffer = this.metrics.get('response_time:getRecommendations');
    const requestCount = requestBuffer ? requestBuffer.size() : 0;
    const avgQueriesPerRequest = requestCount > 0
      ? (dbTotal / requestCount).toFixed(2)
      : '0.00';

    return {
      uptime: `${(uptime / 1000).toFixed(0)}s`,
      cache: {
        hits: cacheHits,
        misses: cacheMisses,
        hitRate: `${cacheHitRate}%`,
      },
      database: {
        totalQueries: dbTotal,
        avgQueriesPerRequest,
      },
      counters: Object.fromEntries(this.counters),
    };
  }

  /**
   * メトリクスレポートを生成
   */
  generateReport(): string {
    const summary = this.getSummary();
    return `
=== Recommendation System Metrics ===
Uptime: ${summary.uptime}

Cache Performance:
  - Hits: ${summary.cache.hits}
  - Misses: ${summary.cache.misses}
  - Hit Rate: ${summary.cache.hitRate}

Database Performance:
  - Total Queries: ${summary.database.totalQueries}
  - Avg Queries/Request: ${summary.database.avgQueriesPerRequest}

All Counters:
${Object.entries(summary.counters)
  .map(([key, value]) => `  - ${key}: ${value}`)
  .join('\n')}
=====================================
    `.trim();
  }
}

// シングルトンインスタンスのエクスポート
export const recommendationMetrics = RecommendationMetrics.getInstance();