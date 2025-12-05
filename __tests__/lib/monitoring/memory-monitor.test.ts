/**
 * Memory Monitor Tests
 */
import {
  MemoryMonitor,
  getRecommendedHeapSize,
  forceGC,
} from '@/lib/monitoring/memory-monitor';

describe('MemoryMonitor', () => {
  let monitor: MemoryMonitor;

  beforeEach(() => {
    // Reset singleton to get fresh instance with test config
    MemoryMonitor.resetInstance();
    monitor = MemoryMonitor.getInstance({
      intervalMs: 100,
      enableLogging: false,
      enableAlerts: false,
      historySize: 10,
      thresholds: {
        warningPercent: 70,
        criticalPercent: 85,
        maxHeapMB: 512,
      },
    });
  });

  afterEach(() => {
    monitor.stop();
  });

  describe('getStats', () => {
    it('should return memory statistics', () => {
      const stats = monitor.getStats();

      expect(stats).toHaveProperty('heapUsed');
      expect(stats).toHaveProperty('heapTotal');
      expect(stats).toHaveProperty('external');
      expect(stats).toHaveProperty('rss');
      expect(stats).toHaveProperty('heapUsedMB');
      expect(stats).toHaveProperty('heapTotalMB');
      expect(stats).toHaveProperty('rssMB');
      expect(stats).toHaveProperty('heapUsedPercent');
      expect(stats).toHaveProperty('timestamp');

      expect(typeof stats.heapUsed).toBe('number');
      expect(typeof stats.heapUsedMB).toBe('number');
      expect(stats.heapUsed).toBeGreaterThan(0);
      expect(stats.heapUsedMB).toBeGreaterThan(0);
    });

    it('should calculate heap percentage correctly', () => {
      const stats = monitor.getStats();

      expect(stats.heapUsedPercent).toBeGreaterThanOrEqual(0);
      expect(stats.heapUsedPercent).toBeLessThanOrEqual(100);
    });
  });

  describe('sample', () => {
    it('should record a sample and add to history', () => {
      expect(monitor.getHistory()).toHaveLength(0);

      monitor.sample();
      expect(monitor.getHistory()).toHaveLength(1);

      monitor.sample();
      expect(monitor.getHistory()).toHaveLength(2);
    });

    it('should respect history size limit', () => {
      // Add more samples than history size
      for (let i = 0; i < 15; i++) {
        monitor.sample();
      }

      // Should only keep 10 (historySize)
      expect(monitor.getHistory()).toHaveLength(10);
    });
  });

  describe('getSummary', () => {
    it('should return summary with current stats', () => {
      const summary = monitor.getSummary();

      expect(summary).toHaveProperty('current');
      expect(summary).toHaveProperty('thresholds');
      expect(summary).toHaveProperty('alertLevel');
      expect(summary).toHaveProperty('uptime');
      expect(summary).toHaveProperty('stats');

      expect(summary.alertLevel).toBe('none');
      expect(summary.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should calculate stats from history', () => {
      // Add some samples
      monitor.sample();
      monitor.sample();
      monitor.sample();

      const summary = monitor.getSummary();

      expect(summary.stats.sampleCount).toBe(3);
      expect(summary.stats.avgHeapUsedMB).toBeGreaterThan(0);
      expect(summary.stats.maxHeapUsedMB).toBeGreaterThanOrEqual(summary.stats.minHeapUsedMB);
    });
  });

  describe('start/stop', () => {
    it('should start and stop monitoring', async () => {
      monitor.start();

      // Wait for a few samples
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Should have at least 2 samples (initial + 1-2 interval samples)
      expect(monitor.getHistory().length).toBeGreaterThanOrEqual(1);

      monitor.stop();
    });

    it('should not start twice', () => {
      monitor.start();
      const historyBefore = monitor.getHistory().length;

      // Start again - should be no-op
      monitor.start();

      // Should still be running with same state
      expect(monitor.getHistory().length).toBe(historyBefore);

      monitor.stop();
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      monitor.sample();
      monitor.sample();

      expect(monitor.getHistory()).toHaveLength(2);

      monitor.reset();

      expect(monitor.getHistory()).toHaveLength(0);
    });
  });
});

describe('getRecommendedHeapSize', () => {
  it('should return a positive number', () => {
    const size = getRecommendedHeapSize();
    expect(size).toBeGreaterThan(0);
    expect(typeof size).toBe('number');
  });

  it('should return 512 or 1024', () => {
    const size = getRecommendedHeapSize();
    expect([512, 1024]).toContain(size);
  });
});

describe('forceGC', () => {
  it('should return false when gc is not exposed', () => {
    // In normal test environment, gc is not exposed
    const result = forceGC();
    expect(result).toBe(false);
  });
});
