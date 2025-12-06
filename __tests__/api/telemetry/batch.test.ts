/**
 * Batch Telemetry API Tests
 */
import { GET } from '@/app/api/telemetry/batch/route';
import { BatchMetrics } from '@/lib/monitoring/batch-metrics';

describe('/api/telemetry/batch', () => {
  let metrics: BatchMetrics;

  beforeEach(() => {
    // Use getInstance and reset to work with the same singleton as the API
    metrics = BatchMetrics.getInstance();
    metrics.reset();
  });

  describe('GET', () => {
    it('should return batch metrics summary with required fields', async () => {
      const response = await GET();
      expect(response.status).toBe(200);

      const data = await response.json();

      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('uptime');
      expect(data).toHaveProperty('runningJobs');
      expect(data).toHaveProperty('recentExecutions');
      expect(data).toHaveProperty('jobStats');
      expect(data).toHaveProperty('summary');
    });

    it('should return summary with counts', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.summary).toHaveProperty('totalExecutions');
      expect(data.summary).toHaveProperty('successCount');
      expect(data.summary).toHaveProperty('failureCount');
      expect(data.summary).toHaveProperty('overallSuccessRate');
      expect(data.summary).toHaveProperty('activeJobs');
    });

    it('should reflect running jobs', async () => {
      metrics.startJob('rss-collection');
      metrics.startJob('summary-generation');

      const response = await GET();
      const data = await response.json();

      expect(data.runningJobs).toHaveLength(2);
      expect(data.summary.activeJobs).toBe(2);
    });

    it('should reflect completed jobs', async () => {
      const jobId = metrics.startJob('test-job');
      metrics.incrementProcessed(jobId, 10);
      metrics.completeJob(jobId);

      const response = await GET();
      const data = await response.json();

      expect(data.recentExecutions).toHaveLength(1);
      expect(data.recentExecutions[0].status).toBe('completed');
      expect(data.recentExecutions[0].itemsProcessed).toBe(10);
    });

    it('should have no-store cache control header', async () => {
      const response = await GET();
      expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    });
  });
});
