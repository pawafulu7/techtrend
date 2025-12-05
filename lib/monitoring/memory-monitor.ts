/**
 * Memory Monitoring Module
 *
 * Provides memory usage tracking, alerting, and GC monitoring.
 * Designed to work with Node.js --max-old-space-size limits.
 */

import logger from '@/lib/logger';

/**
 * Memory usage statistics
 */
export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  rss: number;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  heapUsedPercent: number;
  timestamp: number;
}

/**
 * Memory alert thresholds
 */
export interface MemoryThresholds {
  warningPercent: number;  // Warn when heap usage exceeds this percentage
  criticalPercent: number; // Critical alert when heap usage exceeds this percentage
  maxHeapMB: number;       // Maximum expected heap size in MB
}

/**
 * Memory monitoring configuration
 */
export interface MemoryMonitorConfig {
  thresholds: MemoryThresholds;
  intervalMs: number;        // Monitoring interval in milliseconds
  enableLogging: boolean;    // Enable periodic logging
  enableAlerts: boolean;     // Enable threshold alerts
  historySize: number;       // Number of samples to keep in history
}

const DEFAULT_CONFIG: MemoryMonitorConfig = {
  thresholds: {
    warningPercent: 70,
    criticalPercent: 85,
    maxHeapMB: parseInt(process.env.NODE_MAX_HEAP_MB || '512', 10),
  },
  intervalMs: 60000, // 1 minute
  enableLogging: process.env.NODE_ENV !== 'test',
  enableAlerts: true,
  historySize: 60, // Keep 1 hour of minute samples
};

/**
 * Calculate heap used percentage with safe bounds
 * Handles edge cases: NaN, 0, negative maxHeapMB values
 */
function calculateHeapUsedPercent(heapUsedMB: number, maxHeapMB: number): number {
  // Validate maxHeapMB: must be a positive finite number
  const safeMaxHeapMB =
    typeof maxHeapMB === 'number' && Number.isFinite(maxHeapMB) && maxHeapMB > 0
      ? maxHeapMB
      : DEFAULT_CONFIG.thresholds.maxHeapMB;

  const rawPercent = (heapUsedMB / safeMaxHeapMB) * 100;

  // Clamp to 0-100 range
  return Math.max(0, Math.min(100, Math.round(rawPercent)));
}

/**
 * Memory Monitor Singleton
 */
export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private config: MemoryMonitorConfig;
  private intervalHandle: NodeJS.Timeout | null = null;
  private history: MemoryStats[] = [];
  private lastAlertLevel: 'none' | 'warning' | 'critical' = 'none';
  private startTime: number = Date.now();

  private constructor(config: Partial<MemoryMonitorConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      thresholds: {
        ...DEFAULT_CONFIG.thresholds,
        ...(config.thresholds || {}),
      },
    };
  }

  static getInstance(config?: Partial<MemoryMonitorConfig>): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor(config);
    }
    return MemoryMonitor.instance;
  }

  /**
   * Get current memory statistics
   */
  getStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const rssMB = memUsage.rss / 1024 / 1024;

    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      rss: memUsage.rss,
      heapUsedMB: Math.round(heapUsedMB * 100) / 100,
      heapTotalMB: Math.round(heapTotalMB * 100) / 100,
      rssMB: Math.round(rssMB * 100) / 100,
      heapUsedPercent: calculateHeapUsedPercent(
        heapUsedMB,
        this.config.thresholds.maxHeapMB
      ),
      timestamp: Date.now(),
    };
  }

  /**
   * Start periodic memory monitoring
   */
  start(): void {
    if (this.intervalHandle) {
      return; // Already running
    }

    logger.info({
      msg: 'Memory monitor started',
      config: {
        intervalMs: this.config.intervalMs,
        thresholds: this.config.thresholds,
      },
    });

    // Take initial sample
    this.sample();

    // Start periodic sampling
    this.intervalHandle = setInterval(() => {
      this.sample();
    }, this.config.intervalMs);
  }

  /**
   * Stop periodic memory monitoring
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      logger.info('Memory monitor stopped');
    }
  }

  /**
   * Take a memory sample and check thresholds
   */
  sample(): MemoryStats {
    const stats = this.getStats();

    // Add to history
    this.history.push(stats);
    if (this.history.length > this.config.historySize) {
      this.history.shift();
    }

    // Log if enabled
    if (this.config.enableLogging) {
      logger.info({
        type: 'memory_sample',
        heapUsedMB: stats.heapUsedMB,
        heapTotalMB: stats.heapTotalMB,
        rssMB: stats.rssMB,
        heapUsedPercent: stats.heapUsedPercent,
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
      });
    }

    // Check thresholds if enabled
    if (this.config.enableAlerts) {
      this.checkThresholds(stats);
    }

    return stats;
  }

  /**
   * Check memory thresholds and log alerts
   */
  private checkThresholds(stats: MemoryStats): void {
    const { warningPercent, criticalPercent } = this.config.thresholds;

    if (stats.heapUsedPercent >= criticalPercent) {
      if (this.lastAlertLevel !== 'critical') {
        logger.error({
          type: 'memory_alert',
          level: 'critical',
          heapUsedPercent: stats.heapUsedPercent,
          heapUsedMB: stats.heapUsedMB,
          threshold: criticalPercent,
          msg: `Memory usage CRITICAL: ${stats.heapUsedPercent}% of max heap`,
        });
        this.lastAlertLevel = 'critical';
      }
    } else if (stats.heapUsedPercent >= warningPercent) {
      if (this.lastAlertLevel !== 'warning') {
        logger.warn({
          type: 'memory_alert',
          level: 'warning',
          heapUsedPercent: stats.heapUsedPercent,
          heapUsedMB: stats.heapUsedMB,
          threshold: warningPercent,
          msg: `Memory usage WARNING: ${stats.heapUsedPercent}% of max heap`,
        });
        this.lastAlertLevel = 'warning';
      }
    } else {
      // Reset alert level when memory is back to normal
      if (this.lastAlertLevel !== 'none') {
        logger.info({
          type: 'memory_alert',
          level: 'recovered',
          heapUsedPercent: stats.heapUsedPercent,
          heapUsedMB: stats.heapUsedMB,
          msg: 'Memory usage returned to normal',
        });
        this.lastAlertLevel = 'none';
      }
    }
  }

  /**
   * Get memory usage history
   */
  getHistory(): MemoryStats[] {
    return [...this.history];
  }

  /**
   * Get memory summary for API response
   */
  getSummary(): MemorySummary {
    const current = this.getStats();
    const history = this.getHistory();

    let avgHeapUsedMB = current.heapUsedMB;
    let maxHeapUsedMB = current.heapUsedMB;
    let minHeapUsedMB = current.heapUsedMB;

    if (history.length > 0) {
      const heapValues = history.map((s) => s.heapUsedMB);
      avgHeapUsedMB = heapValues.reduce((a, b) => a + b, 0) / heapValues.length;
      maxHeapUsedMB = Math.max(...heapValues);
      minHeapUsedMB = Math.min(...heapValues);
    }

    return {
      current,
      thresholds: this.config.thresholds,
      alertLevel: this.lastAlertLevel,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      stats: {
        avgHeapUsedMB: Math.round(avgHeapUsedMB * 100) / 100,
        maxHeapUsedMB: Math.round(maxHeapUsedMB * 100) / 100,
        minHeapUsedMB: Math.round(minHeapUsedMB * 100) / 100,
        sampleCount: history.length,
      },
    };
  }

  /**
   * Reset monitor state (for testing)
   */
  reset(): void {
    this.stop();
    this.history = [];
    this.lastAlertLevel = 'none';
    this.startTime = Date.now();
  }

  /**
   * Reset singleton instance (for testing)
   * This allows creating a fresh instance with new config
   */
  static resetInstance(): void {
    if (MemoryMonitor.instance) {
      MemoryMonitor.instance.stop();
    }
    MemoryMonitor.instance = undefined!;
  }
}

/**
 * Memory summary for API responses
 */
export interface MemorySummary {
  current: MemoryStats;
  thresholds: MemoryThresholds;
  alertLevel: 'none' | 'warning' | 'critical';
  uptime: number;
  stats: {
    avgHeapUsedMB: number;
    maxHeapUsedMB: number;
    minHeapUsedMB: number;
    sampleCount: number;
  };
}

/**
 * Get recommended --max-old-space-size based on available memory
 */
export function getRecommendedHeapSize(): number {
  // Default recommendation: 512MB for web workers, 1024MB for background jobs
  const isBackgroundJob = process.argv.some(
    (arg) => arg.includes('worker') || arg.includes('job') || arg.includes('scheduled')
  );

  return isBackgroundJob ? 1024 : 512;
}

/**
 * Force garbage collection if available (requires --expose-gc flag)
 */
export function forceGC(): boolean {
  if (typeof global.gc === 'function') {
    global.gc();
    logger.info('Forced garbage collection executed');
    return true;
  }
  return false;
}

// Singleton export
export const memoryMonitor = MemoryMonitor.getInstance();
