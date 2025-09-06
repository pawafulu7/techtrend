/**
 * Performance metrics collection utility
 * Tracks API response times, database query times, and cache performance
 */

export interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  dbQueryTime: number;
  cacheCheckTime: number;
  cacheStatus: 'HIT' | 'MISS' | 'STALE';
  totalTime: number;
  breakdown: {
    [key: string]: number;
  };
}

export class MetricsCollector {
  private metrics: PerformanceMetrics;
  private timers: Map<string, number>;

  constructor() {
    this.metrics = {
      startTime: Date.now(),
      dbQueryTime: 0,
      cacheCheckTime: 0,
      cacheStatus: 'MISS',
      totalTime: 0,
      breakdown: {},
    };
    this.timers = new Map();
  }

  /**
   * Start timing a specific operation
   */
  startTimer(name: string): void {
    this.timers.set(name, Date.now());
  }

  /**
   * End timing a specific operation and record the duration
   */
  endTimer(name: string): number {
    const startTime = this.timers.get(name);
    if (!startTime) {
      console.warn(`Timer '${name}' was not started`);
      return 0;
    }
    
    const duration = Date.now() - startTime;
    this.metrics.breakdown[name] = duration;
    
    // Update specific metrics based on timer name
    if (name === 'db_query') {
      this.metrics.dbQueryTime += duration;
    } else if (name === 'cache_check') {
      this.metrics.cacheCheckTime = duration;
    }
    
    this.timers.delete(name);
    return duration;
  }

  /**
   * Set cache status
   */
  setCacheStatus(status: 'HIT' | 'MISS' | 'STALE'): void {
    this.metrics.cacheStatus = status;
  }

  /**
   * Finalize metrics and calculate total time
   */
  finalize(): PerformanceMetrics {
    this.metrics.endTime = Date.now();
    this.metrics.totalTime = this.metrics.endTime - this.metrics.startTime;
    return this.metrics;
  }

  /**
   * Get current metrics without finalizing
   */
  getMetrics(): PerformanceMetrics {
    return {
      ...this.metrics,
      totalTime: Date.now() - this.metrics.startTime,
    };
  }

  /**
   * Generate Server-Timing header value
   */
  getServerTimingHeader(): string {
    const timings: string[] = [];
    
    if (this.metrics.dbQueryTime > 0) {
      timings.push(`db;dur=${this.metrics.dbQueryTime};desc="Database Query"`);
    }
    
    if (this.metrics.cacheCheckTime > 0) {
      timings.push(`cache;dur=${this.metrics.cacheCheckTime};desc="Cache Check"`);
    }
    
    // Add breakdown timings
    for (const [name, duration] of Object.entries(this.metrics.breakdown)) {
      if (!['db_query', 'cache_check'].includes(name)) {
        timings.push(`${name};dur=${duration}`);
      }
    }
    
    timings.push(`total;dur=${this.metrics.totalTime};desc="Total Time"`);
    
    return timings.join(', ');
  }

  /**
   * Add custom metric headers to response
   */
  addMetricsToHeaders(headers: Headers): void {
    const metrics = this.finalize();
    
    headers.set('X-Response-Time', `${metrics.totalTime}ms`);
    headers.set('X-DB-Query-Time', `${metrics.dbQueryTime}ms`);
    headers.set('X-Cache-Check-Time', `${metrics.cacheCheckTime}ms`);
    headers.set('X-Cache-Status', metrics.cacheStatus);
    headers.set('Server-Timing', this.getServerTimingHeader());
    
    // Add breakdown as JSON for debugging
    if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG_METRICS === 'true') {
      headers.set('X-Performance-Breakdown', JSON.stringify(metrics.breakdown));
    }
  }
}

/**
 * Async wrapper for timing database operations
 */
export async function withDbTiming<T>(
  collector: MetricsCollector,
  operation: () => Promise<T>,
  operationName = 'db_query'
): Promise<T> {
  collector.startTimer(operationName);
  try {
    const result = await operation();
    return result;
  } finally {
    collector.endTimer(operationName);
  }
}

/**
 * Async wrapper for timing cache operations
 */
export async function withCacheTiming<T>(
  collector: MetricsCollector,
  operation: () => Promise<T>,
  operationName = 'cache_check'
): Promise<T> {
  collector.startTimer(operationName);
  try {
    const result = await operation();
    return result;
  } finally {
    collector.endTimer(operationName);
  }
}