/**
 * Cache KPI Monitoring Module
 *
 * Provides unified cache performance monitoring including:
 * - Hit rate tracking
 * - Response time by cache status
 * - Miss pattern analysis
 * - Historical trends
 */

import logger from '@/lib/logger';

/**
 * Cache operation status
 */
export type CacheStatus = 'hit' | 'miss' | 'stale' | 'error';

/**
 * Cache operation record
 */
export interface CacheOperation {
  key: string;
  status: CacheStatus;
  duration: number;
  timestamp: number;
  namespace?: string;
}

/**
 * Cache metrics summary
 */
export interface CacheMetricsSummary {
  timestamp: string;
  uptime: number;
  totals: {
    hits: number;
    misses: number;
    stale: number;
    errors: number;
    total: number;
  };
  rates: {
    hitRate: number;
    missRate: number;
    staleRate: number;
    errorRate: number;
  };
  responseTime: {
    hit: LatencyStats | null;
    miss: LatencyStats | null;
    stale: LatencyStats | null;
    overall: LatencyStats | null;
  };
  byNamespace: Record<string, NamespaceMetrics>;
  recentOperations: number;
}

/**
 * Latency statistics
 */
export interface LatencyStats {
  count: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Per-namespace metrics
 */
export interface NamespaceMetrics {
  hits: number;
  misses: number;
  hitRate: number;
}

/**
 * Ring buffer for storing recent operations
 */
class OperationBuffer {
  private buffer: CacheOperation[];
  private writeIndex = 0;
  private isFull = false;
  private readonly maxSize: number;

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize;
    this.buffer = new Array(maxSize);
  }

  push(operation: CacheOperation): void {
    this.buffer[this.writeIndex] = operation;
    this.writeIndex = (this.writeIndex + 1) % this.maxSize;
    if (this.writeIndex === 0) {
      this.isFull = true;
    }
  }

  getAll(): CacheOperation[] {
    if (!this.isFull && this.writeIndex === 0) {
      return [];
    }
    if (!this.isFull) {
      return this.buffer.slice(0, this.writeIndex);
    }
    return [...this.buffer.slice(this.writeIndex), ...this.buffer.slice(0, this.writeIndex)];
  }

  getRecent(count: number): CacheOperation[] {
    const all = this.getAll();
    return all.slice(-count);
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
 * Cache Metrics Monitor Singleton
 */
export class CacheMetrics {
  private static instance: CacheMetrics;
  private operations: OperationBuffer;
  private counters = {
    hits: 0,
    misses: 0,
    stale: 0,
    errors: 0,
  };
  private namespaceCounters = new Map<string, { hits: number; misses: number }>();
  private startTime: number;
  private logInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.operations = new OperationBuffer(10000);
    this.startTime = Date.now();
  }

  static getInstance(): CacheMetrics {
    if (!CacheMetrics.instance) {
      CacheMetrics.instance = new CacheMetrics();
    }
    return CacheMetrics.instance;
  }

  /**
   * Record a cache operation
   */
  recordOperation(
    key: string,
    status: CacheStatus,
    duration: number,
    namespace?: string
  ): void {
    // Update counters
    switch (status) {
      case 'hit':
        this.counters.hits++;
        break;
      case 'miss':
        this.counters.misses++;
        break;
      case 'stale':
        this.counters.stale++;
        break;
      case 'error':
        this.counters.errors++;
        break;
    }

    // Update namespace counters
    if (namespace) {
      const ns = this.namespaceCounters.get(namespace) || { hits: 0, misses: 0 };
      if (status === 'hit' || status === 'stale') {
        ns.hits++;
      } else if (status === 'miss') {
        ns.misses++;
      }
      this.namespaceCounters.set(namespace, ns);
    }

    // Store operation
    this.operations.push({
      key,
      status,
      duration,
      timestamp: Date.now(),
      namespace,
    });
  }

  /**
   * Record a cache hit
   */
  hit(key: string, duration: number, namespace?: string): void {
    this.recordOperation(key, 'hit', duration, namespace);
  }

  /**
   * Record a cache miss
   */
  miss(key: string, duration: number, namespace?: string): void {
    this.recordOperation(key, 'miss', duration, namespace);
  }

  /**
   * Record a stale cache hit
   */
  stale(key: string, duration: number, namespace?: string): void {
    this.recordOperation(key, 'stale', duration, namespace);
  }

  /**
   * Record a cache error
   */
  error(key: string, duration: number, namespace?: string): void {
    this.recordOperation(key, 'error', duration, namespace);
  }

  /**
   * Calculate latency statistics for a set of operations
   */
  private calculateLatencyStats(operations: CacheOperation[]): LatencyStats | null {
    if (operations.length === 0) {
      return null;
    }

    const durations = operations.map((op) => op.duration);
    const sorted = [...durations].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      count: len,
      avg: Math.round((durations.reduce((a, b) => a + b, 0) / len) * 100) / 100,
      min: sorted[0],
      max: sorted[len - 1],
      p50: sorted[Math.floor(len * 0.5)] ?? 0,
      p95: sorted[Math.floor(len * 0.95)] ?? 0,
      p99: sorted[Math.floor(len * 0.99)] ?? 0,
    };
  }

  /**
   * Get comprehensive cache metrics summary
   */
  getSummary(): CacheMetricsSummary {
    const allOps = this.operations.getAll();
    const total =
      this.counters.hits + this.counters.misses + this.counters.stale + this.counters.errors;

    // Calculate rates
    const rates = {
      hitRate: total > 0 ? Math.round((this.counters.hits / total) * 10000) / 100 : 0,
      missRate: total > 0 ? Math.round((this.counters.misses / total) * 10000) / 100 : 0,
      staleRate: total > 0 ? Math.round((this.counters.stale / total) * 10000) / 100 : 0,
      errorRate: total > 0 ? Math.round((this.counters.errors / total) * 10000) / 100 : 0,
    };

    // Calculate response times by status
    const hitOps = allOps.filter((op) => op.status === 'hit');
    const missOps = allOps.filter((op) => op.status === 'miss');
    const staleOps = allOps.filter((op) => op.status === 'stale');

    // Calculate namespace metrics
    const byNamespace: Record<string, NamespaceMetrics> = {};
    for (const [namespace, counts] of this.namespaceCounters.entries()) {
      const nsTotal = counts.hits + counts.misses;
      byNamespace[namespace] = {
        hits: counts.hits,
        misses: counts.misses,
        hitRate: nsTotal > 0 ? Math.round((counts.hits / nsTotal) * 10000) / 100 : 0,
      };
    }

    return {
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      totals: {
        hits: this.counters.hits,
        misses: this.counters.misses,
        stale: this.counters.stale,
        errors: this.counters.errors,
        total,
      },
      rates,
      responseTime: {
        hit: this.calculateLatencyStats(hitOps),
        miss: this.calculateLatencyStats(missOps),
        stale: this.calculateLatencyStats(staleOps),
        overall: this.calculateLatencyStats(allOps),
      },
      byNamespace,
      recentOperations: allOps.length,
    };
  }

  /**
   * Start periodic logging of cache metrics
   */
  startPeriodicLogging(intervalMs: number = 60000): void {
    if (this.logInterval) {
      return;
    }

    this.logInterval = setInterval(() => {
      const summary = this.getSummary();
      logger.info({
        type: 'cache_metrics',
        hitRate: summary.rates.hitRate,
        missRate: summary.rates.missRate,
        total: summary.totals.total,
        avgLatencyHit: summary.responseTime.hit?.avg ?? 0,
        avgLatencyMiss: summary.responseTime.miss?.avg ?? 0,
      });
    }, intervalMs);
  }

  /**
   * Stop periodic logging
   */
  stopPeriodicLogging(): void {
    if (this.logInterval) {
      clearInterval(this.logInterval);
      this.logInterval = null;
    }
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.stopPeriodicLogging();
    this.operations.clear();
    this.counters = { hits: 0, misses: 0, stale: 0, errors: 0 };
    this.namespaceCounters.clear();
    this.startTime = Date.now();
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    if (CacheMetrics.instance) {
      CacheMetrics.instance.reset();
    }
    CacheMetrics.instance = undefined as any;
  }
}

// Singleton export
export const cacheMetrics = CacheMetrics.getInstance();

/**
 * Utility function to wrap cache operations with metrics tracking
 */
export async function withCacheMetrics<T>(
  key: string,
  operation: () => Promise<{ data: T; status: CacheStatus }>,
  namespace?: string
): Promise<T> {
  const metrics = CacheMetrics.getInstance();
  const start = performance.now();
  try {
    const result = await operation();
    const duration = performance.now() - start;
    metrics.recordOperation(key, result.status, duration, namespace);
    return result.data;
  } catch (error) {
    const duration = performance.now() - start;
    metrics.error(key, duration, namespace);
    throw error;
  }
}
