/**
 * API Baseline Monitor Tests
 */
import {
  ApiBaselineMonitor,
  DEFAULT_API_BASELINES,
} from '@/lib/monitoring/api-baseline';

describe('ApiBaselineMonitor', () => {
  let monitor: ApiBaselineMonitor;

  beforeEach(() => {
    ApiBaselineMonitor.resetInstance();
    monitor = ApiBaselineMonitor.getInstance();
  });

  describe('default baselines', () => {
    it('should load default baselines', () => {
      const summary = monitor.getSummary();
      expect(summary.baselines.length).toBeGreaterThan(0);
      expect(summary.baselines.length).toBe(DEFAULT_API_BASELINES.length);
    });

    it('should have baseline for /api/articles', () => {
      const baseline = monitor.getBaseline('/api/articles', 'GET');
      expect(baseline).toBeDefined();
      expect(baseline!.p50Baseline).toBeGreaterThan(0);
    });
  });

  describe('setBaseline', () => {
    it('should set a new baseline', () => {
      monitor.setBaseline({
        endpoint: '/api/custom',
        method: 'POST',
        p50Baseline: 100,
        p95Baseline: 200,
        p99Baseline: 300,
        warningThreshold: 25,
        criticalThreshold: 50,
      });

      const baseline = monitor.getBaseline('/api/custom', 'POST');
      expect(baseline).toBeDefined();
      expect(baseline!.p50Baseline).toBe(100);
    });

    it('should override existing baseline', () => {
      monitor.setBaseline({
        endpoint: '/api/articles',
        method: 'GET',
        p50Baseline: 999,
        p95Baseline: 999,
        p99Baseline: 999,
        warningThreshold: 10,
        criticalThreshold: 20,
      });

      const baseline = monitor.getBaseline('/api/articles', 'GET');
      expect(baseline!.p50Baseline).toBe(999);
    });
  });

  describe('updateMeasurement', () => {
    it('should record a measurement', () => {
      monitor.updateMeasurement({
        endpoint: '/api/articles',
        method: 'GET',
        p50: 90,
        p95: 220,
        p99: 450,
        count: 100,
        timestamp: Date.now(),
      });

      const summary = monitor.getSummary();
      expect(summary.measurements).toHaveLength(1);
      expect(summary.measurements[0].endpoint).toBe('/api/articles');
    });
  });

  describe('compareAll', () => {
    it('should return ok when within threshold', () => {
      monitor.updateMeasurement({
        endpoint: '/api/articles',
        method: 'GET',
        p50: 100,  // Equal to baseline
        p95: 250,
        p99: 500,
        count: 100,
        timestamp: Date.now(),
      });

      const comparisons = monitor.compareAll();
      const comparison = comparisons.find(c => c.endpoint === '/api/articles');

      expect(comparison).toBeDefined();
      expect(comparison!.status).toBe('ok');
      expect(comparison!.p50.deviation).toBe(0);
    });

    it('should return warning when above warning threshold', () => {
      const baseline = monitor.getBaseline('/api/articles', 'GET')!;
      const p50WithWarning = baseline.p50Baseline * 1.25; // 25% above baseline

      monitor.updateMeasurement({
        endpoint: '/api/articles',
        method: 'GET',
        p50: p50WithWarning,
        p95: baseline.p95Baseline,
        p99: baseline.p99Baseline,
        count: 100,
        timestamp: Date.now(),
      });

      const comparisons = monitor.compareAll();
      const comparison = comparisons.find(c => c.endpoint === '/api/articles');

      expect(comparison!.status).toBe('warning');
    });

    it('should return critical when above critical threshold', () => {
      const baseline = monitor.getBaseline('/api/articles', 'GET')!;
      const p50Critical = baseline.p50Baseline * 1.6; // 60% above baseline

      monitor.updateMeasurement({
        endpoint: '/api/articles',
        method: 'GET',
        p50: p50Critical,
        p95: baseline.p95Baseline,
        p99: baseline.p99Baseline,
        count: 100,
        timestamp: Date.now(),
      });

      const comparisons = monitor.compareAll();
      const comparison = comparisons.find(c => c.endpoint === '/api/articles');

      expect(comparison!.status).toBe('critical');
    });

    it('should return no-baseline for endpoints without baseline', () => {
      monitor.updateMeasurement({
        endpoint: '/api/unknown',
        method: 'GET',
        p50: 100,
        p95: 200,
        p99: 300,
        count: 100,
        timestamp: Date.now(),
      });

      const comparisons = monitor.compareAll();
      const comparison = comparisons.find(c => c.endpoint === '/api/unknown');

      expect(comparison).toBeDefined();
      expect(comparison!.status).toBe('no-baseline');
    });
  });

  describe('getSummary', () => {
    it('should return summary with all data', () => {
      monitor.updateMeasurement({
        endpoint: '/api/articles',
        method: 'GET',
        p50: 90,
        p95: 220,
        p99: 450,
        count: 100,
        timestamp: Date.now(),
      });

      const summary = monitor.getSummary();

      expect(summary).toHaveProperty('baselines');
      expect(summary).toHaveProperty('measurements');
      expect(summary).toHaveProperty('comparisons');
      expect(summary).toHaveProperty('summary');

      expect(summary.summary.total).toBeGreaterThan(0);
    });

    it('should calculate summary counts correctly', () => {
      // Add measurements with different statuses
      monitor.updateMeasurement({
        endpoint: '/api/articles',
        method: 'GET',
        p50: 100,
        p95: 250,
        p99: 500,
        count: 100,
        timestamp: Date.now(),
      });

      monitor.updateMeasurement({
        endpoint: '/api/unknown',
        method: 'GET',
        p50: 100,
        p95: 200,
        p99: 300,
        count: 50,
        timestamp: Date.now(),
      });

      const summary = monitor.getSummary();

      expect(summary.summary.total).toBe(2);
      expect(summary.summary.ok).toBe(1);
      expect(summary.summary.noBaseline).toBe(1);
    });
  });

  describe('resetMeasurements', () => {
    it('should clear all measurements', () => {
      monitor.updateMeasurement({
        endpoint: '/api/articles',
        method: 'GET',
        p50: 100,
        p95: 250,
        p99: 500,
        count: 100,
        timestamp: Date.now(),
      });

      expect(monitor.getSummary().measurements).toHaveLength(1);

      monitor.resetMeasurements();

      expect(monitor.getSummary().measurements).toHaveLength(0);
    });
  });
});
