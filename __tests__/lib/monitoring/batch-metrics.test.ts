/**
 * Batch Metrics Tests
 */
import {
  BatchMetrics,
  withBatchMetrics,
} from '@/lib/monitoring/batch-metrics';

describe('BatchMetrics', () => {
  let metrics: BatchMetrics;

  beforeEach(() => {
    BatchMetrics.resetInstance();
    metrics = BatchMetrics.getInstance();
  });

  describe('startJob', () => {
    it('should start a job and return job ID', () => {
      const jobId = metrics.startJob('test-job');
      expect(jobId).toBeDefined();
      expect(jobId).toMatch(/^job_/);

      const summary = metrics.getSummary();
      expect(summary.runningJobs).toHaveLength(1);
      expect(summary.runningJobs[0].jobName).toBe('test-job');
      expect(summary.runningJobs[0].status).toBe('running');
    });

    it('should accept metadata', () => {
      const jobId = metrics.startJob('test-job', { source: 'rss' });

      const summary = metrics.getSummary();
      expect(summary.runningJobs[0].metadata).toEqual({ source: 'rss' });
    });
  });

  describe('updateProgress', () => {
    it('should update job progress', () => {
      const jobId = metrics.startJob('test-job');

      metrics.updateProgress(jobId, {
        itemsProcessed: 10,
        itemsFailed: 2,
        itemsSkipped: 1,
      });

      const summary = metrics.getSummary();
      expect(summary.runningJobs[0].itemsProcessed).toBe(10);
      expect(summary.runningJobs[0].itemsFailed).toBe(2);
      expect(summary.runningJobs[0].itemsSkipped).toBe(1);
    });

    it('should merge metadata', () => {
      const jobId = metrics.startJob('test-job', { key1: 'value1' });

      metrics.updateProgress(jobId, {
        metadata: { key2: 'value2' },
      });

      const summary = metrics.getSummary();
      expect(summary.runningJobs[0].metadata).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });
  });

  describe('incrementProcessed', () => {
    it('should increment processed count', () => {
      const jobId = metrics.startJob('test-job');

      metrics.incrementProcessed(jobId);
      metrics.incrementProcessed(jobId);
      metrics.incrementProcessed(jobId, 3);

      const summary = metrics.getSummary();
      expect(summary.runningJobs[0].itemsProcessed).toBe(5);
    });
  });

  describe('incrementFailed', () => {
    it('should increment failed count', () => {
      const jobId = metrics.startJob('test-job');

      metrics.incrementFailed(jobId);
      metrics.incrementFailed(jobId, 2);

      const summary = metrics.getSummary();
      expect(summary.runningJobs[0].itemsFailed).toBe(3);
    });
  });

  describe('completeJob', () => {
    it('should complete a job and move to history', () => {
      const jobId = metrics.startJob('test-job');
      metrics.incrementProcessed(jobId, 10);

      const completed = metrics.completeJob(jobId);

      expect(completed).toBeDefined();
      expect(completed!.status).toBe('completed');
      expect(completed!.duration).toBeGreaterThanOrEqual(0);

      const summary = metrics.getSummary();
      expect(summary.runningJobs).toHaveLength(0);
      expect(summary.recentExecutions).toHaveLength(1);
      expect(summary.recentExecutions[0].status).toBe('completed');
    });
  });

  describe('failJob', () => {
    it('should fail a job with error message', () => {
      const jobId = metrics.startJob('test-job');

      const failed = metrics.failJob(jobId, 'Connection timeout');

      expect(failed).toBeDefined();
      expect(failed!.status).toBe('failed');
      expect(failed!.error).toBe('Connection timeout');

      const summary = metrics.getSummary();
      expect(summary.recentExecutions[0].status).toBe('failed');
    });

    it('should accept Error object', () => {
      const jobId = metrics.startJob('test-job');

      const failed = metrics.failJob(jobId, new Error('Test error'));

      expect(failed!.error).toBe('Test error');
    });
  });

  describe('cancelJob', () => {
    it('should cancel a job', () => {
      const jobId = metrics.startJob('test-job');

      const cancelled = metrics.cancelJob(jobId, 'User requested');

      expect(cancelled).toBeDefined();
      expect(cancelled!.status).toBe('cancelled');
      expect(cancelled!.error).toBe('User requested');
    });
  });

  describe('getJobStats', () => {
    it('should return undefined for non-existent job', () => {
      const stats = metrics.getJobStats('non-existent');
      expect(stats).toBeUndefined();
    });

    it('should calculate job statistics', () => {
      // Run some jobs
      const jobId1 = metrics.startJob('test-job');
      metrics.incrementProcessed(jobId1, 10);
      metrics.completeJob(jobId1);

      const jobId2 = metrics.startJob('test-job');
      metrics.incrementProcessed(jobId2, 5);
      metrics.incrementFailed(jobId2, 2);
      metrics.completeJob(jobId2);

      const jobId3 = metrics.startJob('test-job');
      metrics.failJob(jobId3, 'Error');

      const stats = metrics.getJobStats('test-job');

      expect(stats).toBeDefined();
      expect(stats!.totalExecutions).toBe(3);
      expect(stats!.successCount).toBe(2);
      expect(stats!.failureCount).toBe(1);
      expect(stats!.successRate).toBeCloseTo(66.67, 1);
      expect(stats!.totalItemsProcessed).toBe(15);
      expect(stats!.totalItemsFailed).toBe(2);
    });
  });

  describe('getSummary', () => {
    it('should return empty summary when no jobs', () => {
      const summary = metrics.getSummary();

      expect(summary.runningJobs).toHaveLength(0);
      expect(summary.recentExecutions).toHaveLength(0);
      expect(summary.summary.totalExecutions).toBe(0);
      expect(summary.summary.activeJobs).toBe(0);
    });

    it('should include all required fields', () => {
      const summary = metrics.getSummary();

      expect(summary).toHaveProperty('timestamp');
      expect(summary).toHaveProperty('uptime');
      expect(summary).toHaveProperty('runningJobs');
      expect(summary).toHaveProperty('recentExecutions');
      expect(summary).toHaveProperty('jobStats');
      expect(summary).toHaveProperty('summary');
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      const jobId = metrics.startJob('test-job');
      metrics.completeJob(jobId);

      metrics.reset();

      const summary = metrics.getSummary();
      expect(summary.runningJobs).toHaveLength(0);
      expect(summary.recentExecutions).toHaveLength(0);
    });
  });
});

describe('withBatchMetrics', () => {
  beforeEach(() => {
    BatchMetrics.resetInstance();
  });

  it('should track successful job execution', async () => {
    const result = await withBatchMetrics('test-job', async (ctx) => {
      ctx.incrementProcessed(5);
      return 'success';
    });

    expect(result).toBe('success');

    const metrics = BatchMetrics.getInstance();
    const summary = metrics.getSummary();
    expect(summary.recentExecutions).toHaveLength(1);
    expect(summary.recentExecutions[0].status).toBe('completed');
    expect(summary.recentExecutions[0].itemsProcessed).toBe(5);
  });

  it('should track failed job execution', async () => {
    await expect(
      withBatchMetrics('test-job', async () => {
        throw new Error('Job failed');
      })
    ).rejects.toThrow('Job failed');

    const metrics = BatchMetrics.getInstance();
    const summary = metrics.getSummary();
    expect(summary.recentExecutions[0].status).toBe('failed');
    expect(summary.recentExecutions[0].error).toBe('Job failed');
  });

  it('should pass metadata to job', async () => {
    await withBatchMetrics(
      'test-job',
      async (ctx) => {
        ctx.updateMetadata({ processed: true });
        return null;
      },
      { source: 'rss' }
    );

    const metrics = BatchMetrics.getInstance();
    const summary = metrics.getSummary();
    expect(summary.recentExecutions[0].metadata).toEqual({
      source: 'rss',
      processed: true,
    });
  });
});
