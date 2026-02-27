// Mock setup (must be before imports)
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockPipeline = {
  ttl: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
};

const mockRedis = {
  info: jest.fn().mockResolvedValue(''),
  config: jest.fn().mockResolvedValue(['maxmemory', '2147483648']),
  scan: jest.fn().mockResolvedValue(['0', []]),
  pipeline: jest.fn(() => mockPipeline),
};

jest.mock('@/lib/redis/client', () => ({
  getRedisClient: jest.fn(() => mockRedis),
}));

jest.mock('@/lib/types/redis', () => ({
  safeUnlink: jest.fn().mockResolvedValue(undefined),
}));

let mockStatsTTL = 600;
let mockTrendsTTL = 1800;

jest.mock('@/lib/cache/stats-cache', () => ({
  statsCache: {
    getDefaultTTL: jest.fn(() => mockStatsTTL),
    setDefaultTTL: jest.fn((v: number) => {
      mockStatsTTL = v;
    }),
    getStats: jest.fn(() => ({})),
    resetStats: jest.fn(),
  },
}));

jest.mock('@/lib/cache/trends-cache', () => ({
  trendsCache: {
    getDefaultTTL: jest.fn(() => mockTrendsTTL),
    setDefaultTTL: jest.fn((v: number) => {
      mockTrendsTTL = v;
    }),
    getStats: jest.fn(() => ({})),
    resetStats: jest.fn(),
  },
}));

jest.mock('@/lib/cache/search-cache', () => ({
  searchCache: {
    getSearchStats: jest.fn(() => ({})),
    resetStats: jest.fn(),
  },
}));

// Import after mocks
import { MemoryOptimizer } from '@/lib/cache/memory-optimizer';
import { CACHE_NAMESPACE_PREFIX } from '@/lib/cache/constants';

describe('MemoryOptimizer', () => {
  let optimizer: MemoryOptimizer;

  beforeEach(() => {
    optimizer = new MemoryOptimizer();
    // Reset TTL values
    mockStatsTTL = 600;
    mockTrendsTTL = 1800;
    // Reset mock implementations (clearAllMocks removes default implementations too)
    mockRedis.info.mockReset().mockResolvedValue('');
    mockRedis.config.mockReset().mockResolvedValue(['maxmemory', '2147483648']);
    mockRedis.scan.mockReset().mockResolvedValue(['0', []]);
    mockRedis.pipeline.mockReset().mockReturnValue(mockPipeline);
    mockPipeline.exec.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    optimizer.stopMonitoring();
  });

  describe('ns() - namespace pattern generation', () => {
    it('should return pattern with CACHE_NAMESPACE_PREFIX without envName', () => {
      // Access private method via type assertion
      const result = (optimizer as any).ns('search:*');
      expect(result).toBe(`${CACHE_NAMESPACE_PREFIX}:search:*`);
      expect(result).toBe('@techtrend/cache:search:*');
      // Must NOT contain environment name
      expect(result).not.toContain('development');
      expect(result).not.toContain('production');
      expect(result).not.toContain('unknown');
    });
  });

  describe('adjustTTLs() - baseline-based TTL adjustment', () => {
    it('should use baseline instead of current value for TTL calculation', async () => {
      // Initialize baselines
      (optimizer as any).initializeTTLBaselines();

      // Baseline: stats=600, trends=1800
      await (optimizer as any).adjustTTLs(0.8);

      // stats: 600 * 0.8 = 480
      expect(mockStatsTTL).toBe(480);
      // trends: 1800 * 0.8 = 1440
      expect(mockTrendsTTL).toBe(1440);
    });

    it('should be idempotent - calling twice produces same result (no compounding)', async () => {
      (optimizer as any).initializeTTLBaselines();

      await (optimizer as any).adjustTTLs(0.8);
      const afterFirst = { stats: mockStatsTTL, trends: mockTrendsTTL };

      await (optimizer as any).adjustTTLs(0.8);
      const afterSecond = { stats: mockStatsTTL, trends: mockTrendsTTL };

      // Both calls should produce the same result (baseline * 0.8)
      expect(afterFirst.stats).toBe(afterSecond.stats);
      expect(afterFirst.trends).toBe(afterSecond.trends);
      expect(afterSecond.stats).toBe(480); // 600 * 0.8
      expect(afterSecond.trends).toBe(1440); // 1800 * 0.8
    });

    it('should respect minTTL bound', async () => {
      mockStatsTTL = 70;
      (optimizer as any).initializeTTLBaselines();

      // 70 * 0.8 = 56, but minTTL is 60
      await (optimizer as any).adjustTTLs(0.8);
      expect(mockStatsTTL).toBe(60);
    });

    it('should respect maxTTL bound', async () => {
      mockStatsTTL = 10000;
      (optimizer as any).initializeTTLBaselines();

      // 10000 * 0.8 = 8000, but maxTTL is 7200
      await (optimizer as any).adjustTTLs(0.8);
      expect(mockStatsTTL).toBe(7200);
    });
  });

  describe('restoreTTLs() - TTL recovery mechanism', () => {
    it('should increase TTL by 20% of gap toward baseline', async () => {
      (optimizer as any).initializeTTLBaselines();
      // Baseline: stats=600, current after adjust: 480
      await (optimizer as any).adjustTTLs(0.8);
      expect(mockStatsTTL).toBe(480);

      await (optimizer as any).restoreTTLs();
      // Gap: 600 - 480 = 120, step: ceil(120 * 0.2) = 24
      // New: 480 + 24 = 504
      expect(mockStatsTTL).toBe(504);
    });

    it('should eventually restore to baseline after multiple calls', async () => {
      (optimizer as any).initializeTTLBaselines();
      // Baseline: stats=600
      await (optimizer as any).adjustTTLs(0.8);
      expect(mockStatsTTL).toBe(480);

      // Call restoreTTLs many times to reach baseline
      for (let i = 0; i < 50; i++) {
        await (optimizer as any).restoreTTLs();
      }

      expect(mockStatsTTL).toBe(600); // Fully restored to baseline
    });

    it('should not increase TTL beyond baseline', async () => {
      (optimizer as any).initializeTTLBaselines();
      // Current is already at baseline
      await (optimizer as any).restoreTTLs();
      expect(mockStatsTTL).toBe(600); // No change
    });
  });

  describe('checkMemoryUsage() - hysteresis behavior', () => {
    beforeEach(() => {
      // Ensure isChecking is reset
      (optimizer as any).isChecking = false;
    });

    it('should call restoreTTLs when usage < 65% (recovery threshold)', async () => {
      jest.spyOn(optimizer, 'getMemoryInfo').mockResolvedValue({
        used: 1288490189, // ~60% of 2GB
        peak: 2000000000,
        maxMemory: 2147483648,
        fragmentation: 1.0,
      });

      const restoreSpy = jest
        .spyOn(optimizer as any, 'restoreTTLs')
        .mockResolvedValue(undefined);

      await (optimizer as any).checkMemoryUsage();

      expect(restoreSpy).toHaveBeenCalled();
    });

    it('should NOT call restoreTTLs when usage is between 65% and 75% (hysteresis gap)', async () => {
      jest.spyOn(optimizer, 'getMemoryInfo').mockResolvedValue({
        used: 1503238554, // ~70% of 2GB
        peak: 2000000000,
        maxMemory: 2147483648,
        fragmentation: 1.0,
      });

      // Verify the mock works
      const info = await optimizer.getMemoryInfo();
      const usagePercent = (info.used / info.maxMemory) * 100;
      expect(usagePercent).toBeGreaterThan(65);
      expect(usagePercent).toBeLessThan(75);

      const restoreSpy = jest
        .spyOn(optimizer as any, 'restoreTTLs')
        .mockResolvedValue(undefined);
      const optimizeSpy = jest
        .spyOn(optimizer as any, 'performOptimization')
        .mockResolvedValue(undefined);

      await (optimizer as any).checkMemoryUsage();

      expect(restoreSpy).not.toHaveBeenCalled();
      expect(optimizeSpy).not.toHaveBeenCalled();
    });

    it('should call performOptimization when usage >= 75%', async () => {
      jest.spyOn(optimizer, 'getMemoryInfo').mockResolvedValue({
        used: 1717986918, // ~80% of 2GB
        peak: 2000000000,
        maxMemory: 2147483648,
        fragmentation: 1.0,
      });

      const optimizeSpy = jest
        .spyOn(optimizer as any, 'performOptimization')
        .mockResolvedValue(undefined);

      await (optimizer as any).checkMemoryUsage();

      expect(optimizeSpy).toHaveBeenCalled();
    });
  });

  describe('updateBaseline() - external baseline update', () => {
    it('should update baseline for named cache', () => {
      (optimizer as any).initializeTTLBaselines();
      expect((optimizer as any).ttlBaselines.get('stats')).toBe(600);

      optimizer.updateBaseline('stats', 1800);
      expect((optimizer as any).ttlBaselines.get('stats')).toBe(1800);
    });

    it('should use updated baseline in restoreTTLs', async () => {
      (optimizer as any).initializeTTLBaselines();

      // Reduce TTL
      await (optimizer as any).adjustTTLs(0.8);
      expect(mockStatsTTL).toBe(480); // 600 * 0.8

      // Update baseline to 1800
      optimizer.updateBaseline('stats', 1800);

      // Restore should now step toward 1800
      await (optimizer as any).restoreTTLs();
      // Gap: 1800 - 480 = 1320, step: ceil(1320 * 0.2) = 264
      // New: 480 + 264 = 744
      expect(mockStatsTTL).toBe(744);
    });
  });
});
