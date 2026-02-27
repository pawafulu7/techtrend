jest.mock('@/lib/logger', () => ({
  __esModule: true,
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    article: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    source: {
      count: jest.fn().mockResolvedValue(0),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/lib/cache/stats-cache', () => ({
  statsCache: {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
  },
}));

jest.mock('@/lib/cache/trends-cache', () => ({
  trendsCache: {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
  },
}));

jest.mock('@/lib/cache/keywords-cache', () => ({
  keywordsCache: {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
  },
}));

jest.mock('@/lib/cache/search-cache', () => ({
  searchCache: {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    generateQueryKey: jest.fn((q: { q: string }) => `search:${q.q}`),
  },
}));

// Mock getRedisClient using relative path to bypass moduleNameMapper
// Factory function runs in jest.mock scope where jest.fn() is available
jest.mock('../../../lib/redis/client', () => {
  const mockGet = jest.fn().mockResolvedValue(null);
  const mockSetex = jest.fn().mockResolvedValue('OK');
  return {
    __esModule: true,
    getRedisClient: () => ({
      get: mockGet,
      set: jest.fn().mockResolvedValue('OK'),
      setex: mockSetex,
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(0),
      expire: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK'),
      ping: jest.fn().mockResolvedValue('PONG'),
    }),
    // Export mock fns for test assertions
    __mockGet: mockGet,
    __mockSetex: mockSetex,
  };
});

import { CacheWarmer } from '@/lib/cache/cache-warmer';
import { logger } from '@/lib/logger';

// Access mock functions from the mock module
const redisMock = jest.requireMock('../../../lib/redis/client') as {
  __mockGet: jest.Mock;
  __mockSetex: jest.Mock;
};
const mockGet = redisMock.__mockGet;
const mockSetex = redisMock.__mockSetex;

describe('CacheWarmer', () => {
  let warmer: CacheWarmer;

  beforeEach(() => {
    mockGet.mockReset().mockResolvedValue(null);
    mockSetex.mockReset().mockResolvedValue('OK');
    (logger.warn as jest.Mock).mockClear();

    // Reset cache mocks
    const { statsCache } = jest.requireMock('@/lib/cache/stats-cache') as {
      statsCache: { set: jest.Mock };
    };
    statsCache.set.mockReset().mockResolvedValue(undefined);

    const { trendsCache } = jest.requireMock('@/lib/cache/trends-cache') as {
      trendsCache: { set: jest.Mock };
    };
    trendsCache.set.mockReset().mockResolvedValue(undefined);

    const { keywordsCache } = jest.requireMock(
      '@/lib/cache/keywords-cache'
    ) as {
      keywordsCache: { set: jest.Mock };
    };
    keywordsCache.set.mockReset().mockResolvedValue(undefined);

    const { searchCache } = jest.requireMock('@/lib/cache/search-cache') as {
      searchCache: { set: jest.Mock; generateQueryKey: jest.Mock };
    };
    searchCache.set.mockReset().mockResolvedValue(undefined);
    searchCache.generateQueryKey
      .mockReset()
      .mockImplementation((q: { q: string }) => `search:${q.q}`);

    warmer = new CacheWarmer();
  });

  describe('shouldWarm (via warmManual)', () => {
    it('returns true when Redis has no lastRun key (first run)', async () => {
      mockGet.mockResolvedValue(null);

      await warmer.warmManual(['stats']);

      expect(mockGet).toHaveBeenCalledWith('cache-warmer:lastRun:stats');
      expect(mockSetex).toHaveBeenCalled();
    });

    it('returns false when interval not elapsed', async () => {
      mockGet.mockResolvedValue(String(Date.now()));

      await warmer.warmManual(['stats']);

      expect(mockSetex).not.toHaveBeenCalled();
    });

    it('returns true when interval elapsed', async () => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      mockGet.mockResolvedValue(String(twoHoursAgo));

      await warmer.warmManual(['stats']);

      expect(mockSetex).toHaveBeenCalled();
    });

    it('returns true on Redis error (fail-open)', async () => {
      mockGet.mockRejectedValue(new Error('Redis connection error'));

      await warmer.warmManual(['stats']);

      expect(mockGet).toHaveBeenCalled();
    });
  });

  describe('recordWarmingRun', () => {
    it('stores timestamp in Redis with TTL', async () => {
      mockGet.mockResolvedValue(null);

      await warmer.warmManual(['stats']);

      // Stats interval is 3600000ms (1 hour), TTL = ceil(3600000/1000) * 2 = 7200
      expect(mockSetex).toHaveBeenCalledWith(
        'cache-warmer:lastRun:stats',
        7200,
        expect.any(String)
      );
    });
  });

  describe('warmManual', () => {
    it('only warms targets that pass shouldWarm check', async () => {
      mockGet
        .mockResolvedValueOnce(String(Date.now())) // stats - skip
        .mockResolvedValueOnce(null); // trends - warm

      await warmer.warmManual(['stats', 'trends']);

      expect(mockSetex).toHaveBeenCalledTimes(1);
      expect(mockSetex).toHaveBeenCalledWith(
        'cache-warmer:lastRun:trends',
        expect.any(Number),
        expect.any(String)
      );
    });

    it('records successful runs only (not failures)', async () => {
      mockGet.mockResolvedValue(null);

      const { statsCache } = jest.requireMock('@/lib/cache/stats-cache') as {
        statsCache: { set: jest.Mock };
      };
      statsCache.set.mockRejectedValueOnce(new Error('cache write failed'));

      await warmer.warmManual(['stats', 'trends']);

      const setexCalls = mockSetex.mock.calls.filter(
        (call: string[]) => call[0] === 'cache-warmer:lastRun:trends'
      );
      expect(setexCalls.length).toBe(1);
    });
  });

  describe('startPeriodicWarming', () => {
    it('logs deprecation warning', () => {
      warmer.startPeriodicWarming();

      expect(logger.warn).toHaveBeenCalledWith(
        '[CacheWarmer] startPeriodicWarming is deprecated. Use external cron (GHA scheduler) instead.'
      );
    });
  });

  describe('stopPeriodicWarming', () => {
    it('logs deprecation warning', () => {
      warmer.stopPeriodicWarming();

      expect(logger.warn).toHaveBeenCalledWith(
        '[CacheWarmer] stopPeriodicWarming is deprecated. Use external cron (GHA scheduler) instead.'
      );
    });
  });

  describe('warmOnStartup removal', () => {
    it('warmOnStartup no longer exists', () => {
      expect((warmer as Record<string, unknown>).warmOnStartup).toBeUndefined();
    });
  });

  describe('getStatus', () => {
    it('does not include periodicWarmingActive', () => {
      const status = warmer.getStatus();

      expect(status).toHaveProperty('isWarming');
      expect(status).toHaveProperty('config');
      expect(status).not.toHaveProperty('periodicWarmingActive');
    });
  });
});
