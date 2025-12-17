// モック設定（インポート前に宣言）
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// RedisCacheのモック
jest.mock('@/lib/cache/index', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
    getOrSet: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  })),
}));

// tagCache, sourceCache, popularCacheのモック
jest.mock('@/lib/cache/tag-cache', () => ({
  tagCache: {
    invalidate: jest.fn().mockResolvedValue(undefined),
    invalidateTag: jest.fn().mockResolvedValue(undefined),
  },
}));

// 注意: Jest config の moduleNameMapper で `@/lib/cache/source-cache` は manual mock に差し替えられるため、
// CacheInvalidator 側（相対import）と同じ実体を指すパスでモックする
jest.mock('../../../lib/cache/source-cache', () => ({
  sourceCache: {
    invalidate: jest.fn().mockResolvedValue(undefined),
    invalidateSource: jest.fn().mockResolvedValue(undefined),
  },
  SourceCache: jest.fn(),
}));

jest.mock('@/lib/cache/popular-cache', () => ({
  popularCache: {
    invalidateAll: jest.fn().mockResolvedValue(undefined),
    invalidatePeriod: jest.fn().mockResolvedValue(undefined),
  },
}));

// getRedisServiceをモックして実際のRedis接続を避ける
jest.mock('@/lib/redis/factory', () => ({
  getRedisService: jest.fn(() => ({
    clearPattern: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  })),
}));

// インポート（モック設定後）
import { CacheInvalidator } from '@/lib/cache/cache-invalidator';
import { CACHE_NAMESPACES, createCachePattern } from '@/lib/cache/constants';
import { RedisCache } from '@/lib/cache/index';
import { popularCache } from '@/lib/cache/popular-cache';
import { sourceCache } from '../../../lib/cache/source-cache';
import { tagCache } from '@/lib/cache/tag-cache';
import type { IRedisService } from '@/lib/redis/interfaces';

describe('CacheInvalidator', () => {
  let cacheInvalidator: CacheInvalidator;
  let mockRedisService: jest.Mocked<IRedisService>;
  let mockTagCacheInvalidate: jest.Mock;
  let mockSourceCacheInvalidate: jest.Mock;
  let mockPopularCacheInvalidateAll: jest.Mock;

  const getRedisCacheInvalidatePatternMocks = (): jest.Mock[] => {
    const redisCacheConstructor = RedisCache as unknown as jest.Mock;
    return redisCacheConstructor.mock.results.map((result: { value: unknown }) => {
      const instance = result.value as { invalidatePattern?: unknown };
      return instance.invalidatePattern as jest.Mock;
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockTagCacheInvalidate = tagCache.invalidate as unknown as jest.Mock;
    mockSourceCacheInvalidate = sourceCache.invalidate as unknown as jest.Mock;
    mockPopularCacheInvalidateAll = popularCache.invalidateAll as unknown as jest.Mock;

    // モックRedisServiceを作成し、コンストラクタに注入
    mockRedisService = {
      clearPattern: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(0),
      exists: jest.fn().mockResolvedValue(false),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(true),
      ttl: jest.fn().mockResolvedValue(-1),
      scan: jest.fn().mockResolvedValue({ cursor: '0', keys: [] }),
      keys: jest.fn().mockResolvedValue([]),
      pipeline: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      }),
      multi: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      }),
      getClient: jest.fn().mockReturnValue(null),
      isConnected: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<IRedisService>;

    // モックRedisServiceを注入してインスタンス化
    cacheInvalidator = new CacheInvalidator(mockRedisService);
  });

  describe('onBulkImport', () => {
    it('should invalidate LayeredCache L1 PUBLIC namespace', async () => {
      await cacheInvalidator.onBulkImport();

      expect(mockRedisService.clearPattern).toHaveBeenCalledWith(
        createCachePattern(CACHE_NAMESPACES.L1_PUBLIC)
      );
    });

    it('should invalidate LayeredCache L3 SEARCH namespace', async () => {
      await cacheInvalidator.onBulkImport();

      expect(mockRedisService.clearPattern).toHaveBeenCalledWith(
        createCachePattern(CACHE_NAMESPACES.L3_SEARCH)
      );
    });

    it('should invalidate ARTICLES_LIGHTWEIGHT namespace', async () => {
      await cacheInvalidator.onBulkImport();

      expect(mockRedisService.clearPattern).toHaveBeenCalledWith(
        createCachePattern(CACHE_NAMESPACES.ARTICLES_LIGHTWEIGHT)
      );
    });

    it('should invalidate ARTICLES_API namespace', async () => {
      await cacheInvalidator.onBulkImport();

      expect(mockRedisService.clearPattern).toHaveBeenCalledWith(
        createCachePattern(CACHE_NAMESPACES.ARTICLES_API)
      );
    });

    it('should invalidate all existing caches', async () => {
      await cacheInvalidator.onBulkImport();

      // RedisCacheのinvalidatePatternが呼ばれることを確認
      // 3つのRedisCache（articleCache, relatedCache, tagCloudCache）で呼ばれる
      const invalidatePatternMocks = getRedisCacheInvalidatePatternMocks();
      expect(invalidatePatternMocks).toHaveLength(3);
      for (const mock of invalidatePatternMocks) {
        expect(mock).toHaveBeenCalledWith('*');
      }

      // 既存のキャッシュ無効化
      expect(mockTagCacheInvalidate).toHaveBeenCalled();
      expect(mockSourceCacheInvalidate).toHaveBeenCalled();
      expect(mockPopularCacheInvalidateAll).toHaveBeenCalled();
    });

    it('should call clearPattern with correct namespace patterns', async () => {
      await cacheInvalidator.onBulkImport();

      // 4つのnamespaceパターンでclearPatternが呼ばれることを確認
      expect(mockRedisService.clearPattern).toHaveBeenCalledTimes(4);

      // パターンの内容を確認
      const calls = (mockRedisService.clearPattern as jest.Mock).mock.calls.map(
        (call: unknown[]) => call[0]
      );
      expect(calls).toContain(createCachePattern(CACHE_NAMESPACES.L1_PUBLIC));
      expect(calls).toContain(createCachePattern(CACHE_NAMESPACES.L3_SEARCH));
      expect(calls).toContain(createCachePattern(CACHE_NAMESPACES.ARTICLES_LIGHTWEIGHT));
      expect(calls).toContain(createCachePattern(CACHE_NAMESPACES.ARTICLES_API));
    });

    it('should execute all invalidations in parallel', async () => {
      // Promise.allで並列実行されることを確認するため、
      // 各モックの呼び出し順序は保証されないが、全て呼ばれることを確認
      const promise = cacheInvalidator.onBulkImport();

      // Promiseが返されることを確認
      expect(promise).toBeInstanceOf(Promise);

      await promise;

      // 全ての無効化が呼ばれたことを確認
      expect(mockRedisService.clearPattern).toHaveBeenCalledTimes(4);
      // invalidatePatternは3つのRedisCache（articleCache, relatedCache, tagCloudCache）で呼ばれる
      const invalidatePatternMocks = getRedisCacheInvalidatePatternMocks();
      const invalidatePatternCallCount = invalidatePatternMocks.reduce(
        (total, mock) => total + mock.mock.calls.length,
        0
      );
      expect(invalidatePatternCallCount).toBe(3);
      expect(mockTagCacheInvalidate).toHaveBeenCalledTimes(1);
      expect(mockSourceCacheInvalidate).toHaveBeenCalledTimes(1);
      expect(mockPopularCacheInvalidateAll).toHaveBeenCalledTimes(1);
    });
  });
});
