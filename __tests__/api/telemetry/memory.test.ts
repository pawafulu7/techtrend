/**
 * Memory Telemetry API Tests
 */
import { GET, POST } from '@/app/api/telemetry/memory/route';
import { memoryMonitor } from '@/lib/monitoring/memory-monitor';

describe('/api/telemetry/memory', () => {
  beforeEach(() => {
    memoryMonitor.reset();
  });

  describe('GET', () => {
    it('should return memory summary with required fields', async () => {
      const response = await GET();
      expect(response.status).toBe(200);

      const data = await response.json();

      expect(data).toHaveProperty('current');
      expect(data).toHaveProperty('thresholds');
      expect(data).toHaveProperty('alertLevel');
      expect(data).toHaveProperty('uptime');
      expect(data).toHaveProperty('stats');
    });

    it('should return current memory stats', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.current).toHaveProperty('heapUsedMB');
      expect(data.current).toHaveProperty('heapTotalMB');
      expect(data.current).toHaveProperty('rssMB');
      expect(data.current).toHaveProperty('heapUsedPercent');
      expect(data.current.heapUsedMB).toBeGreaterThan(0);
    });

    it('should return threshold configuration', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.thresholds).toHaveProperty('warningPercent');
      expect(data.thresholds).toHaveProperty('criticalPercent');
      expect(data.thresholds).toHaveProperty('maxHeapMB');
    });

    it('should have no-store cache control header', async () => {
      const response = await GET();
      expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    });
  });

  describe('POST', () => {
    it('should trigger a memory sample', async () => {
      const historyBefore = memoryMonitor.getHistory().length;

      const response = await POST();
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('stats');
      expect(data.message).toBe('Memory sample recorded');

      const historyAfter = memoryMonitor.getHistory().length;
      expect(historyAfter).toBe(historyBefore + 1);
    });

    it('should return the sampled stats', async () => {
      const response = await POST();
      const data = await response.json();

      expect(data.stats).toHaveProperty('heapUsedMB');
      expect(data.stats).toHaveProperty('timestamp');
      expect(data.stats.heapUsedMB).toBeGreaterThan(0);
    });
  });
});
