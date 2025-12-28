import { CommentsCache } from '@/lib/cache/comments-cache';
import type { PaginatedComments } from '@/lib/comments/comment-service';

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
          const keysToDelete: string[] = [];
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          storage.forEach((_, key) => {
            if (regex.test(key)) {
              keysToDelete.push(key);
            }
          });
          keysToDelete.forEach(key => storage.delete(key));
        }),
        getStats: jest.fn(() => ({ hits: 0, misses: 0 })),
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

describe('CommentsCache', () => {
  let commentsCache: CommentsCache;
  let storage: Map<string, any>;

  const mockPaginatedComments: PaginatedComments = {
    comments: [
      {
        id: 'comment1',
        articleId: 'article1',
        userId: 'user1',
        content: 'Test comment 1',
        visibility: 'PRIVATE',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
        deletedAt: null,
      },
      {
        id: 'comment2',
        articleId: 'article1',
        userId: 'user1',
        content: 'Test comment 2',
        visibility: 'PRIVATE',
        createdAt: new Date('2025-01-01T01:00:00Z'),
        updatedAt: new Date('2025-01-01T01:00:00Z'),
        deletedAt: null,
      },
    ] as any[],
    nextCursor: 'comment2',
    totalCount: 5,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    storage = new Map<string, any>();
    commentsCache = new CommentsCache();

    // ストレージをセットアップ
    const mockCache = (commentsCache as any).cache;
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
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      storage.forEach((_, key) => {
        if (regex.test(key)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => storage.delete(key));
    });
  });

  describe('getComments', () => {
    it('should return cached comments on hit', async () => {
      const articleId = 'article1';
      const userId = 'user1';
      const cursor = null;
      const limit = 10;

      await commentsCache.setComments(articleId, userId, cursor, limit, mockPaginatedComments);
      const result = await commentsCache.getComments(articleId, userId, cursor, limit);

      expect(result).toEqual(mockPaginatedComments);
    });

    it('should return null on cache miss', async () => {
      const result = await commentsCache.getComments('article1', 'user1', null, 10);

      expect(result).toBeNull();
    });

    it('should use "first" for null cursor in cache key', async () => {
      const articleId = 'article1';
      const userId = 'user1';
      const limit = 10;

      await commentsCache.setComments(articleId, userId, null, limit, mockPaginatedComments);

      // "first" キーでキャッシュされていることを確認
      const expectedKey = `a:${articleId}:u:${userId}:c:first:l:${limit}`;
      expect(storage.has(expectedKey)).toBe(true);
    });

    it('should handle different cursors separately', async () => {
      const articleId = 'article1';
      const userId = 'user1';
      const limit = 10;

      const firstPage = { ...mockPaginatedComments, nextCursor: 'cursor1' };
      const secondPage = { ...mockPaginatedComments, comments: [mockPaginatedComments.comments[1]], nextCursor: null };

      await commentsCache.setComments(articleId, userId, null, limit, firstPage);
      await commentsCache.setComments(articleId, userId, 'cursor1', limit, secondPage);

      const resultFirst = await commentsCache.getComments(articleId, userId, null, limit);
      const resultSecond = await commentsCache.getComments(articleId, userId, 'cursor1', limit);

      expect(resultFirst).toEqual(firstPage);
      expect(resultSecond).toEqual(secondPage);
    });

    it('should handle different limits separately', async () => {
      const articleId = 'article1';
      const userId = 'user1';

      const tenItems = { ...mockPaginatedComments };
      const twentyItems = { ...mockPaginatedComments, totalCount: 20 };

      await commentsCache.setComments(articleId, userId, null, 10, tenItems);
      await commentsCache.setComments(articleId, userId, null, 20, twentyItems);

      const resultTen = await commentsCache.getComments(articleId, userId, null, 10);
      const resultTwenty = await commentsCache.getComments(articleId, userId, null, 20);

      expect(resultTen).toEqual(tenItems);
      expect(resultTwenty).toEqual(twentyItems);
    });

    it('should handle Redis error gracefully', async () => {
      const mockCache = (commentsCache as any).cache;
      mockCache.get = jest.fn().mockRejectedValue(new Error('Redis error'));

      const result = await commentsCache.getComments('article1', 'user1', null, 10);

      expect(result).toBeNull();
    });
  });

  describe('setComments', () => {
    it('should cache comments for article and user', async () => {
      const articleId = 'article1';
      const userId = 'user1';

      await commentsCache.setComments(articleId, userId, null, 10, mockPaginatedComments);

      const result = await commentsCache.getComments(articleId, userId, null, 10);
      expect(result).toEqual(mockPaginatedComments);
    });

    it('should handle Redis error gracefully', async () => {
      const mockCache = (commentsCache as any).cache;
      mockCache.set = jest.fn().mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(
        commentsCache.setComments('article1', 'user1', null, 10, mockPaginatedComments)
      ).resolves.not.toThrow();
    });
  });

  describe('invalidate', () => {
    it('should invalidate all cached comments for article and user', async () => {
      const articleId = 'article1';
      const userId = 'user1';

      // 複数ページをキャッシュ
      await commentsCache.setComments(articleId, userId, null, 10, mockPaginatedComments);
      await commentsCache.setComments(articleId, userId, 'cursor1', 10, mockPaginatedComments);
      await commentsCache.setComments(articleId, userId, null, 20, mockPaginatedComments);

      // 無効化
      await commentsCache.invalidate(articleId, userId);

      // すべてのキャッシュが無効化されていることを確認
      const result1 = await commentsCache.getComments(articleId, userId, null, 10);
      const result2 = await commentsCache.getComments(articleId, userId, 'cursor1', 10);
      const result3 = await commentsCache.getComments(articleId, userId, null, 20);

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(result3).toBeNull();
    });

    it('should not affect other users cache', async () => {
      const articleId = 'article1';

      await commentsCache.setComments(articleId, 'user1', null, 10, mockPaginatedComments);
      await commentsCache.setComments(articleId, 'user2', null, 10, mockPaginatedComments);

      await commentsCache.invalidate(articleId, 'user1');

      const resultUser1 = await commentsCache.getComments(articleId, 'user1', null, 10);
      const resultUser2 = await commentsCache.getComments(articleId, 'user2', null, 10);

      expect(resultUser1).toBeNull();
      expect(resultUser2).toEqual(mockPaginatedComments);
    });

    it('should not affect other articles cache', async () => {
      const userId = 'user1';

      await commentsCache.setComments('article1', userId, null, 10, mockPaginatedComments);
      await commentsCache.setComments('article2', userId, null, 10, mockPaginatedComments);

      await commentsCache.invalidate('article1', userId);

      const resultArticle1 = await commentsCache.getComments('article1', userId, null, 10);
      const resultArticle2 = await commentsCache.getComments('article2', userId, null, 10);

      expect(resultArticle1).toBeNull();
      expect(resultArticle2).toEqual(mockPaginatedComments);
    });

    it('should handle Redis error gracefully', async () => {
      const mockCache = (commentsCache as any).cache;
      mockCache.invalidatePattern = jest.fn().mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(commentsCache.invalidate('article1', 'user1')).resolves.not.toThrow();
    });
  });

  describe('clearAll', () => {
    it('should clear all comments cache', async () => {
      await commentsCache.setComments('article1', 'user1', null, 10, mockPaginatedComments);
      await commentsCache.setComments('article2', 'user2', null, 10, mockPaginatedComments);

      await commentsCache.clearAll();

      const mockCache = (commentsCache as any).cache;
      expect(mockCache.invalidatePattern).toHaveBeenCalledWith('*');
    });

    it('should throw error when Redis fails', async () => {
      const mockCache = (commentsCache as any).cache;
      mockCache.invalidatePattern = jest.fn().mockRejectedValue(new Error('Redis error'));

      await expect(commentsCache.clearAll()).rejects.toThrow('Redis error');
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const stats = commentsCache.getStats();

      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
    });
  });

  describe('resetStats', () => {
    it('should reset cache statistics', () => {
      commentsCache.resetStats();

      const mockCache = (commentsCache as any).cache;
      expect(mockCache.resetStats).toHaveBeenCalled();
    });
  });
});
