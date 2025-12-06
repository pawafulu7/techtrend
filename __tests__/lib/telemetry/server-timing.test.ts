/**
 * Server-Timing Utility Tests
 */
import {
  generateServerTimingHeader,
  ServerTimingCollector,
  measureAsync,
} from '@/lib/telemetry/server-timing';

describe('generateServerTimingHeader', () => {
  it('should generate header for single entry', () => {
    const entries = [{ name: 'db', duration: 50.123 }];
    const result = generateServerTimingHeader(entries);
    expect(result).toBe('db;dur=50.12');
  });

  it('should generate header with description', () => {
    const entries = [{ name: 'db', duration: 50, description: 'Database Query' }];
    const result = generateServerTimingHeader(entries);
    expect(result).toBe('db;dur=50.00;desc="Database Query"');
  });

  it('should generate header for multiple entries', () => {
    const entries = [
      { name: 'db', duration: 50 },
      { name: 'cache', duration: 10, description: 'Cache Lookup' },
    ];
    const result = generateServerTimingHeader(entries);
    expect(result).toBe('db;dur=50.00, cache;dur=10.00;desc="Cache Lookup"');
  });

  it('should handle empty entries', () => {
    const result = generateServerTimingHeader([]);
    expect(result).toBe('');
  });
});

describe('ServerTimingCollector', () => {
  describe('start/end', () => {
    it('should track timing of operations', () => {
      const collector = new ServerTimingCollector();

      collector.start('test');
      // Simulate some work (async operations would naturally have delay)
      collector.end('test', 'Test Operation');

      const entries = collector.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('test');
      expect(entries[0].description).toBe('Test Operation');
      expect(entries[0].duration).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 for non-started timer', () => {
      const collector = new ServerTimingCollector();
      const duration = collector.end('nonExistent');
      expect(duration).toBe(0);
    });

    it('should track multiple operations', () => {
      const collector = new ServerTimingCollector();

      collector.start('op1');
      collector.end('op1');
      collector.start('op2');
      collector.end('op2');

      const entries = collector.getEntries();
      expect(entries).toHaveLength(2);
    });
  });

  describe('add', () => {
    it('should add pre-calculated duration', () => {
      const collector = new ServerTimingCollector();
      collector.add('custom', 123.45, 'Custom Metric');

      const entries = collector.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('custom');
      expect(entries[0].duration).toBe(123.45);
      expect(entries[0].description).toBe('Custom Metric');
    });
  });

  describe('getTotalTime', () => {
    it('should return elapsed time since creation', () => {
      const collector = new ServerTimingCollector();
      const totalTime = collector.getTotalTime();
      expect(totalTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getHeader', () => {
    it('should include all entries plus total time', () => {
      const collector = new ServerTimingCollector();
      collector.add('db', 50);
      collector.add('cache', 10);

      const header = collector.getHeader();

      expect(header).toContain('db;dur=50.00');
      expect(header).toContain('cache;dur=10.00');
      expect(header).toContain('total;dur=');
      expect(header).toContain('desc="Total Time"');
    });
  });

  describe('applyToHeaders', () => {
    it('should set Server-Timing header', () => {
      const collector = new ServerTimingCollector();
      collector.add('test', 100);

      const headers = new Headers();
      collector.applyToHeaders(headers);

      const serverTiming = headers.get('Server-Timing');
      expect(serverTiming).not.toBeNull();
      expect(serverTiming).toContain('test;dur=100.00');
    });
  });
});

describe('measureAsync', () => {
  it('should measure async function execution time', async () => {
    const collector = new ServerTimingCollector();

    const result = await measureAsync(
      collector,
      'asyncOp',
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'done';
      },
      'Async Operation'
    );

    expect(result).toBe('done');

    const entries = collector.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('asyncOp');
    expect(entries[0].description).toBe('Async Operation');
    // Allow small timing variance due to setTimeout imprecision
    expect(entries[0].duration).toBeGreaterThanOrEqual(9);
  });

  it('should measure timing even when function throws', async () => {
    const collector = new ServerTimingCollector();

    await expect(
      measureAsync(collector, 'failingOp', async () => {
        throw new Error('Test error');
      })
    ).rejects.toThrow('Test error');

    const entries = collector.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('failingOp');
  });
});
