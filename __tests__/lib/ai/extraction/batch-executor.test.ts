import {
  BatchExecutor,
  BatchJob,
  BatchResult,
} from '@/lib/ai/extraction/batch-executor';

describe('BatchExecutor', () => {
  describe('execute', () => {
    it('should process all jobs successfully', async () => {
      const executor = new BatchExecutor({
        concurrency: 2,
        delayBetweenBatchesMs: 10,
      });

      const jobs: BatchJob<number>[] = [
        { id: '1', input: 1 },
        { id: '2', input: 2 },
        { id: '3', input: 3 },
      ];

      const processor = jest.fn(async (job: BatchJob<number>) => job.input * 2);

      const summary = await executor.execute(jobs, processor);

      expect(summary.total).toBe(3);
      expect(summary.successful).toBe(3);
      expect(summary.failed).toBe(0);
      expect(processor).toHaveBeenCalledTimes(3);
    });

    it('should handle failed jobs', async () => {
      const executor = new BatchExecutor({
        concurrency: 2,
        delayBetweenBatchesMs: 10,
      });

      const jobs: BatchJob<number>[] = [
        { id: '1', input: 1 },
        { id: '2', input: 2 },
        { id: '3', input: 3 },
      ];

      const processor = jest.fn(async (job: BatchJob<number>) => {
        if (job.input === 2) {
          throw new Error('Processing failed');
        }
        return job.input * 2;
      });

      const summary = await executor.execute(jobs, processor);

      expect(summary.total).toBe(3);
      expect(summary.successful).toBe(2);
      expect(summary.failed).toBe(1);
    });

    it('should call progress callback', async () => {
      const onProgress = jest.fn();
      const executor = new BatchExecutor({
        concurrency: 1,
        delayBetweenBatchesMs: 10,
        onProgress,
      });

      const jobs: BatchJob<string>[] = [
        { id: '1', input: 'a' },
        { id: '2', input: 'b' },
      ];

      const processor = jest.fn(async (job: BatchJob<string>) =>
        job.input.toUpperCase()
      );

      await executor.execute(jobs, processor);

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenCalledWith(
        1,
        2,
        expect.objectContaining({ id: '1' })
      );
      expect(onProgress).toHaveBeenCalledWith(
        2,
        2,
        expect.objectContaining({ id: '2' })
      );
    });

    it('should call onJobComplete callback for each job', async () => {
      const onJobComplete = jest.fn();
      const executor = new BatchExecutor({
        concurrency: 2,
        delayBetweenBatchesMs: 10,
        onJobComplete,
      });

      const jobs: BatchJob<number>[] = [
        { id: '1', input: 1 },
        { id: '2', input: 2 },
      ];

      const processor = jest.fn(async (job: BatchJob<number>) => job.input * 2);

      await executor.execute(jobs, processor);

      expect(onJobComplete).toHaveBeenCalledTimes(2);
    });

    it('should track duration for each job', async () => {
      const executor = new BatchExecutor({
        concurrency: 1,
        delayBetweenBatchesMs: 10,
      });

      const jobs: BatchJob<number>[] = [{ id: '1', input: 1 }];

      const processor = jest.fn(async (job: BatchJob<number>) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return job.input;
      });

      const summary = await executor.execute(jobs, processor);

      expect(summary.results[0].durationMs).toBeGreaterThanOrEqual(50);
    });

    it('should respect concurrency limit', async () => {
      const executor = new BatchExecutor({
        concurrency: 2,
        delayBetweenBatchesMs: 10,
      });

      const executionOrder: string[] = [];
      const jobs: BatchJob<number>[] = [
        { id: '1', input: 1 },
        { id: '2', input: 2 },
        { id: '3', input: 3 },
        { id: '4', input: 4 },
      ];

      const processor = jest.fn(async (job: BatchJob<number>) => {
        executionOrder.push(`start-${job.id}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
        executionOrder.push(`end-${job.id}`);
        return job.input;
      });

      await executor.execute(jobs, processor);

      // First batch (1, 2) should complete before second batch (3, 4) starts
      const idx1End = executionOrder.indexOf('end-1');
      const idx2End = executionOrder.indexOf('end-2');
      const idx3Start = executionOrder.indexOf('start-3');
      const idx4Start = executionOrder.indexOf('start-4');

      // At least one of the first batch should complete before the second batch starts
      expect(Math.max(idx1End, idx2End)).toBeLessThan(
        Math.min(idx3Start, idx4Start)
      );
    });
  });

  describe('executeWithRetry', () => {
    it('should retry failed jobs', async () => {
      const executor = new BatchExecutor({
        concurrency: 2,
        delayBetweenBatchesMs: 10,
      });

      let attemptCount = 0;
      const jobs: BatchJob<number>[] = [
        { id: '1', input: 1 },
        { id: '2', input: 2 },
      ];

      const processor = jest.fn(async (job: BatchJob<number>) => {
        if (job.id === '2') {
          attemptCount++;
          if (attemptCount < 2) {
            throw new Error('First attempt fails');
          }
        }
        return job.input * 2;
      });

      const summary = await executor.executeWithRetry(jobs, processor, 1);

      expect(summary.successful).toBe(2);
      expect(summary.failed).toBe(0);
      expect(attemptCount).toBe(2);
    });

    it('should not exceed max retries', async () => {
      const executor = new BatchExecutor({
        concurrency: 1,
        delayBetweenBatchesMs: 10,
      });

      const jobs: BatchJob<number>[] = [{ id: '1', input: 1 }];

      const processor = jest.fn(async () => {
        throw new Error('Always fails');
      });

      const summary = await executor.executeWithRetry(jobs, processor, 2);

      expect(summary.successful).toBe(0);
      expect(summary.failed).toBe(1);
      // Initial attempt + 2 retries = 3 total attempts
      expect(processor).toHaveBeenCalledTimes(3);
    });
  });
});
