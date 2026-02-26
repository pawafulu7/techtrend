import { FavoritesCache } from '@/lib/cache/favorites-cache';

// RedisCacheのモック
jest.mock('@/lib/cache/index', () => {
  const storage = new Map<string, any>();

  return {
    RedisCache: jest.fn().mockImplementation(() => {
      return {
        get: jest.fn(async (key: string) => storage.get(key) || null),
        set: jest.fn(async (key: string, value: any) => {
          storage.set(key, value);
        }),
        delete: jest.fn(async (key: string) => {
          const existed = storage.has(key);
          storage.delete(key);
          return existed;
        }),
        invalidatePattern: jest.fn(async (pattern: string) => {
          // pattern に一致するキーを削除
          const keysToDelete: string[] = [];
          storage.forEach((_, key) => {
            if (pattern === 'user:*' && key.startsWith('user:')) {
              keysToDelete.push(key);
            }
          });
          keysToDelete.forEach((key) => storage.delete(key));
        }),
        getStats: jest.fn(() => ({ hits: 0, misses: 0, errors: 0 })),
        resetStats: jest.fn(),
      };
    }),
  };
});

// loggerのモック
jest.mock('@/lib/logger', () => {
  return {
    __esModule: true,
    default: {
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    },
  };
});

describe('FavoritesCache', () => {
  let favoritesCache: FavoritesCache;

  beforeEach(() => {
    jest.clearAllMocks();
    favoritesCache = new FavoritesCache();
    // ストレージをクリア
    const storage = new Map<string, any>();
    const mockCache = (favoritesCache as any).cache;
    mockCache.get = jest.fn(async (key: string) => storage.get(key) || null);
    mockCache.set = jest.fn(async (key: string, value: any) => {
      storage.set(key, value);
    });
    mockCache.delete = jest.fn(async (key: string) => {
      const existed = storage.has(key);
      storage.delete(key);
      return existed;
    });
    mockCache.invalidatePattern = jest.fn(async (pattern: string) => {
      const keysToDelete: string[] = [];
      storage.forEach((_, key) => {
        if (pattern === 'user:*' && key.startsWith('user:')) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach((key) => storage.delete(key));
    });
  });

  describe('getBatch', () => {
    it('should return cached favorites for requested articles', async () => {
      const userId = 'user1';
      const favorites = { article1: true, article2: false, article3: true };

      await favoritesCache.setBatch(userId, favorites);

      const result = await favoritesCache.getBatch(userId, [
        'article1',
        'article2',
      ]);

      expect(result).toEqual({
        article1: true,
        article2: false,
      });
    });

    it('should return null if cache miss', async () => {
      const result = await favoritesCache.getBatch('user1', ['article1']);

      expect(result).toBeNull();
    });
  });

  describe('setBatch', () => {
    it('should cache favorites for user', async () => {
      const userId = 'user1';
      const favorites = { article1: true, article2: false };

      await favoritesCache.setBatch(userId, favorites);

      const result = await favoritesCache.getBatch(userId, [
        'article1',
        'article2',
      ]);

      expect(result).toEqual(favorites);
    });

    it('should merge with existing cache', async () => {
      const userId = 'user1';

      await favoritesCache.setBatch(userId, { article1: true });
      await favoritesCache.setBatch(userId, { article2: false });

      const result = await favoritesCache.getBatch(userId, [
        'article1',
        'article2',
      ]);

      expect(result).toEqual({
        article1: true,
        article2: false,
      });
    });
  });

  describe('updateSingle', () => {
    it('should update single favorite in cache', async () => {
      const userId = 'user1';

      await favoritesCache.setBatch(userId, { article1: true });
      await favoritesCache.updateSingle(userId, 'article1', false);

      const result = await favoritesCache.getBatch(userId, ['article1']);

      expect(result).toEqual({ article1: false });
    });

    it('should not update if cache does not exist', async () => {
      await favoritesCache.updateSingle('user1', 'article1', true);

      const result = await favoritesCache.getBatch('user1', ['article1']);

      expect(result).toBeNull();
    });
  });

  describe('clearAll', () => {
    it('should clear all users favorites cache', async () => {
      // 複数ユーザーのキャッシュを作成
      await favoritesCache.setBatch('user1', { article1: true });
      await favoritesCache.setBatch('user2', { article2: true });
      await favoritesCache.setBatch('user3', { article3: true });

      // clearAll実行
      await favoritesCache.clearAll();

      // invalidatePatternが呼ばれたことを確認
      const mockCache = (favoritesCache as any).cache;
      expect(mockCache.invalidatePattern).toHaveBeenCalledWith('user:*');

      // 全削除を確認
      const user1Cache = await favoritesCache.getBatch('user1', ['article1']);
      const user2Cache = await favoritesCache.getBatch('user2', ['article2']);
      const user3Cache = await favoritesCache.getBatch('user3', ['article3']);

      expect(user1Cache).toBeNull();
      expect(user2Cache).toBeNull();
      expect(user3Cache).toBeNull();
    });

    it('should handle empty cache gracefully', async () => {
      // キーなしの状態でclearAll
      await expect(favoritesCache.clearAll()).resolves.not.toThrow();

      // invalidatePatternが呼ばれたことを確認
      const mockCache = (favoritesCache as any).cache;
      expect(mockCache.invalidatePattern).toHaveBeenCalledWith('user:*');
    });

    it('should throw error when Redis fails', async () => {
      // Redis接続エラーをシミュレート
      const mockCache = (favoritesCache as any).cache;
      mockCache.invalidatePattern = jest
        .fn()
        .mockRejectedValue(new Error('Redis error'));

      await expect(favoritesCache.clearAll()).rejects.toThrow('Redis error');
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const stats = favoritesCache.getStats();

      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('errors');
    });
  });

  describe('resetStats', () => {
    it('should reset cache statistics', () => {
      favoritesCache.resetStats();

      const mockCache = (favoritesCache as any).cache;
      expect(mockCache.resetStats).toHaveBeenCalled();
    });
  });
});
