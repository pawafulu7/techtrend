/**
 * API Response Time Baseline Module
 *
 * Tracks and compares API response times against established baselines.
 * Used for performance regression detection and trend analysis.
 */

import logger from '@/lib/logger';

/**
 * Baseline configuration for an API endpoint
 */
export interface ApiBaseline {
  endpoint: string;
  method: string;
  p50Baseline: number;  // Expected median response time (ms)
  p95Baseline: number;  // Expected 95th percentile (ms)
  p99Baseline: number;  // Expected 99th percentile (ms)
  warningThreshold: number;  // Percentage above baseline to trigger warning
  criticalThreshold: number; // Percentage above baseline to trigger critical
}

/**
 * Current API performance measurement
 */
export interface ApiMeasurement {
  endpoint: string;
  method: string;
  p50: number;
  p95: number;
  p99: number;
  count: number;
  timestamp: number;
}

/**
 * Comparison result between measurement and baseline
 */
export interface BaselineComparison {
  endpoint: string;
  method: string;
  status: 'ok' | 'warning' | 'critical' | 'no-baseline';
  p50: {
    current: number;
    baseline: number;
    deviation: number;  // Percentage deviation
  };
  p95: {
    current: number;
    baseline: number;
    deviation: number;
  };
  p99: {
    current: number;
    baseline: number;
    deviation: number;
  };
  message: string;
}

/**
 * Default API baselines for TechTrend application
 * These values should be updated based on actual performance data
 */
export const DEFAULT_API_BASELINES: ApiBaseline[] = [
  {
    endpoint: '/api/articles',
    method: 'GET',
    p50Baseline: 100,
    p95Baseline: 250,
    p99Baseline: 500,
    warningThreshold: 20,
    criticalThreshold: 50,
  },
  {
    endpoint: '/api/articles/[id]',
    method: 'GET',
    p50Baseline: 50,
    p95Baseline: 150,
    p99Baseline: 300,
    warningThreshold: 20,
    criticalThreshold: 50,
  },
  {
    endpoint: '/api/summaries',
    method: 'GET',
    p50Baseline: 80,
    p95Baseline: 200,
    p99Baseline: 400,
    warningThreshold: 20,
    criticalThreshold: 50,
  },
  {
    endpoint: '/api/recommendations',
    method: 'GET',
    p50Baseline: 150,
    p95Baseline: 400,
    p99Baseline: 800,
    warningThreshold: 20,
    criticalThreshold: 50,
  },
  {
    endpoint: '/api/search',
    method: 'GET',
    p50Baseline: 200,
    p95Baseline: 500,
    p99Baseline: 1000,
    warningThreshold: 20,
    criticalThreshold: 50,
  },
  {
    endpoint: '/api/telemetry/vitals',
    method: 'POST',
    p50Baseline: 10,
    p95Baseline: 30,
    p99Baseline: 50,
    warningThreshold: 50,
    criticalThreshold: 100,
  },
];

/**
 * Stored measurement with timestamp for TTL management
 */
interface StoredMeasurement {
  measurement: ApiMeasurement;
  updatedAt: number;
}

/**
 * API Baseline Monitor
 */
export class ApiBaselineMonitor {
  private static instance: ApiBaselineMonitor;
  private baselines: Map<string, ApiBaseline>;
  private measurements: Map<string, StoredMeasurement>;
  private readonly maxMeasurements = 500;
  private readonly measurementTTL = 24 * 60 * 60 * 1000; // 24 hours

  private constructor() {
    this.baselines = new Map();
    this.measurements = new Map();

    // Load default baselines
    for (const baseline of DEFAULT_API_BASELINES) {
      this.setBaseline(baseline);
    }
  }

  static getInstance(): ApiBaselineMonitor {
    if (!ApiBaselineMonitor.instance) {
      ApiBaselineMonitor.instance = new ApiBaselineMonitor();
    }
    return ApiBaselineMonitor.instance;
  }

  /**
   * Generate key for endpoint+method combination
   */
  private generateKey(endpoint: string, method: string): string {
    return `${method}:${endpoint}`;
  }

  /**
   * Validate baseline values
   */
  private isValidBaseline(baseline: ApiBaseline): boolean {
    // Check endpoint and method are not empty
    if (!baseline.endpoint || !baseline.method) {
      logger.warn({ baseline }, 'Invalid baseline: endpoint and method are required');
      return false;
    }

    // Check numeric values are finite and non-negative
    const numericFields = [
      baseline.p50Baseline,
      baseline.p95Baseline,
      baseline.p99Baseline,
      baseline.warningThreshold,
      baseline.criticalThreshold,
    ];

    for (const value of numericFields) {
      if (!Number.isFinite(value) || value < 0) {
        logger.warn({ baseline }, 'Invalid baseline: numeric values must be finite and non-negative');
        return false;
      }
    }

    // Check threshold order
    if (baseline.criticalThreshold < baseline.warningThreshold) {
      logger.warn({ baseline }, 'Invalid baseline: criticalThreshold should be >= warningThreshold');
      return false;
    }

    return true;
  }

  /**
   * Set or update a baseline
   */
  setBaseline(baseline: ApiBaseline): void {
    if (!this.isValidBaseline(baseline)) {
      return;
    }
    const key = this.generateKey(baseline.endpoint, baseline.method);
    this.baselines.set(key, baseline);
  }

  /**
   * Get baseline for an endpoint
   */
  getBaseline(endpoint: string, method: string): ApiBaseline | undefined {
    const key = this.generateKey(endpoint, method);
    return this.baselines.get(key);
  }

  /**
   * Validate measurement values
   */
  private isValidMeasurement(measurement: ApiMeasurement): boolean {
    if (!measurement.endpoint || !measurement.method) {
      logger.warn({ measurement }, 'Invalid measurement: endpoint and method are required');
      return false;
    }

    const numericFields = [
      measurement.p50,
      measurement.p95,
      measurement.p99,
      measurement.count,
      measurement.timestamp,
    ];

    for (const value of numericFields) {
      if (!Number.isFinite(value) || value < 0) {
        logger.warn({ measurement }, 'Invalid measurement: numeric values must be finite and non-negative');
        return false;
      }
    }

    return true;
  }

  /**
   * Clean up expired measurements and enforce max size
   */
  private cleanupMeasurements(): void {
    const now = Date.now();

    // Remove expired entries
    for (const [key, stored] of this.measurements.entries()) {
      if (now - stored.updatedAt > this.measurementTTL) {
        this.measurements.delete(key);
      }
    }

    // Enforce max size (remove oldest entries)
    if (this.measurements.size > this.maxMeasurements) {
      const entries = Array.from(this.measurements.entries())
        .sort((a, b) => a[1].updatedAt - b[1].updatedAt);

      const toRemove = entries.slice(0, entries.length - this.maxMeasurements);
      for (const [key] of toRemove) {
        this.measurements.delete(key);
      }
    }
  }

  /**
   * Update measurement for an endpoint
   */
  updateMeasurement(measurement: ApiMeasurement): void {
    if (!this.isValidMeasurement(measurement)) {
      return;
    }

    const key = this.generateKey(measurement.endpoint, measurement.method);
    this.measurements.set(key, {
      measurement,
      updatedAt: Date.now(),
    });

    // Periodic cleanup (every 100 updates)
    if (this.measurements.size % 100 === 0) {
      this.cleanupMeasurements();
    }

    // Auto-compare and log if deviation detected
    const baseline = this.baselines.get(key);
    if (baseline) {
      const comparison = this.compareSingle(measurement, baseline);
      if (comparison.status === 'warning') {
        logger.warn({
          type: 'api_baseline_warning',
          ...comparison,
        });
      } else if (comparison.status === 'critical') {
        logger.error({
          type: 'api_baseline_critical',
          ...comparison,
        });
      }
    }
  }

  /**
   * Compare a single measurement against its baseline
   */
  private compareSingle(
    measurement: ApiMeasurement,
    baseline: ApiBaseline
  ): BaselineComparison {
    const p50Deviation =
      baseline.p50Baseline > 0
        ? ((measurement.p50 - baseline.p50Baseline) / baseline.p50Baseline) * 100
        : 0;
    const p95Deviation =
      baseline.p95Baseline > 0
        ? ((measurement.p95 - baseline.p95Baseline) / baseline.p95Baseline) * 100
        : 0;
    const p99Deviation =
      baseline.p99Baseline > 0
        ? ((measurement.p99 - baseline.p99Baseline) / baseline.p99Baseline) * 100
        : 0;

    // Use max deviation to determine status
    const maxDeviation = Math.max(p50Deviation, p95Deviation, p99Deviation);

    let status: 'ok' | 'warning' | 'critical';
    let message: string;

    if (maxDeviation >= baseline.criticalThreshold) {
      status = 'critical';
      message = `Response time ${maxDeviation.toFixed(1)}% above baseline (critical threshold: ${baseline.criticalThreshold}%)`;
    } else if (maxDeviation >= baseline.warningThreshold) {
      status = 'warning';
      message = `Response time ${maxDeviation.toFixed(1)}% above baseline (warning threshold: ${baseline.warningThreshold}%)`;
    } else {
      status = 'ok';
      message = 'Response time within acceptable range';
    }

    return {
      endpoint: measurement.endpoint,
      method: measurement.method,
      status,
      p50: {
        current: measurement.p50,
        baseline: baseline.p50Baseline,
        deviation: Math.round(p50Deviation * 100) / 100,
      },
      p95: {
        current: measurement.p95,
        baseline: baseline.p95Baseline,
        deviation: Math.round(p95Deviation * 100) / 100,
      },
      p99: {
        current: measurement.p99,
        baseline: baseline.p99Baseline,
        deviation: Math.round(p99Deviation * 100) / 100,
      },
      message,
    };
  }

  /**
   * Compare all current measurements against baselines
   */
  compareAll(): BaselineComparison[] {
    const results: BaselineComparison[] = [];

    for (const [key, stored] of this.measurements.entries()) {
      const measurement = stored.measurement;
      const baseline = this.baselines.get(key);
      if (baseline) {
        results.push(this.compareSingle(measurement, baseline));
      } else {
        results.push({
          endpoint: measurement.endpoint,
          method: measurement.method,
          status: 'no-baseline',
          p50: { current: measurement.p50, baseline: 0, deviation: 0 },
          p95: { current: measurement.p95, baseline: 0, deviation: 0 },
          p99: { current: measurement.p99, baseline: 0, deviation: 0 },
          message: 'No baseline configured for this endpoint',
        });
      }
    }

    return results;
  }

  /**
   * Get summary of all baselines and measurements
   */
  getSummary(): {
    baselines: ApiBaseline[];
    measurements: ApiMeasurement[];
    comparisons: BaselineComparison[];
    summary: {
      total: number;
      ok: number;
      warning: number;
      critical: number;
      noBaseline: number;
    };
  } {
    const comparisons = this.compareAll();

    const summary = {
      total: comparisons.length,
      ok: comparisons.filter((c) => c.status === 'ok').length,
      warning: comparisons.filter((c) => c.status === 'warning').length,
      critical: comparisons.filter((c) => c.status === 'critical').length,
      noBaseline: comparisons.filter((c) => c.status === 'no-baseline').length,
    };

    return {
      baselines: Array.from(this.baselines.values()),
      measurements: Array.from(this.measurements.values()).map(s => s.measurement),
      comparisons,
      summary,
    };
  }

  /**
   * Reset all measurements (for testing)
   */
  resetMeasurements(): void {
    this.measurements.clear();
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    ApiBaselineMonitor.instance = undefined!;
  }
}

// Singleton export
export const apiBaselineMonitor = ApiBaselineMonitor.getInstance();
