/**
 * Mock for @/lib/metrics/performance
 */

export class MetricsCollector {
  private timers: Map<string, number> = new Map();
  private metrics: Map<string, number> = new Map();
  private cacheStatus: string = 'MISS';
  
  startTimer(name: string): void {
    this.timers.set(name, Date.now());
  }
  
  endTimer(name: string): number {
    const start = this.timers.get(name);
    if (!start) return 0;
    const duration = Date.now() - start;
    this.metrics.set(name, duration);
    return duration;
  }
  
  setCacheStatus(status: 'HIT' | 'MISS' | 'STALE'): void {
    this.cacheStatus = status;
  }
  
  addMetricsToHeaders(headers: Headers): void {
    // Mock implementation - just log for debugging
    const serverTiming = Array.from(this.metrics.entries())
      .map(([name, duration]) => `${name};dur=${duration}`)
      .join(', ');
    
    if (serverTiming) {
      headers.set('Server-Timing', serverTiming);
    }
    headers.set('X-Cache-Status', this.cacheStatus);
  }
  
  getMetrics(): Map<string, number> {
    return new Map(this.metrics);
  }
  
  getCacheStatus(): string {
    return this.cacheStatus;
  }
}

export function withDbTiming<T>(
  metrics: MetricsCollector,
  fn: () => T | Promise<T>,
  name: string = 'db_query'
): T | Promise<T> {
  return fn();
}

export function withCacheTiming<T>(
  metrics: MetricsCollector,
  fn: () => T | Promise<T>,
  name: string = 'cache_op'
): T | Promise<T> {
  return fn();
}