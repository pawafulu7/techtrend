import { PopularCache } from '@/lib/cache/popular-cache';

// RedisCache をモック
jest.mock('@/lib/cache/index', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    getOrSet: jest.fn((_key: string, fetcher: () => unknown) => fetcher()),
    invalidatePattern: jest.fn(),
  })),
}));

jest.mock('@/lib/cache/constants', () => ({
  POPULAR_CACHE_DURATION: {
    daily: 300,
    weekly: 600,
    monthly: 1800,
    yearly: 3600,
  },
}));

describe('PopularCache', () => {
  let cache: PopularCache;

  beforeEach(() => {
    cache = new PopularCache();
  });

  describe('generateKey', () => {
    it('period のみでキーを生成する', () => {
      expect(cache.generateKey('weekly')).toBe('articles:weekly');
    });

    it('limit を含めたキーを生成する', () => {
      expect(cache.generateKey('weekly', { limit: 20 })).toBe(
        'articles:weekly:limit:20'
      );
    });

    it('sourceId と tagId を含めたキーを生成する', () => {
      expect(
        cache.generateKey('daily', { sourceId: 'src-1', tagId: 'tag-1' })
      ).toBe('articles:daily:source:src-1:tag:tag-1');
    });

    it('metric を含めたキーを生成する', () => {
      expect(cache.generateKey('weekly', { metric: 'votes' })).toBe(
        'articles:weekly:metric:votes'
      );
    });

    it('異なる metric で異なるキーを生成する', () => {
      const votesKey = cache.generateKey('weekly', {
        limit: 20,
        metric: 'votes',
      });
      const bookmarksKey = cache.generateKey('weekly', {
        limit: 20,
        metric: 'bookmarks',
      });
      const combinedKey = cache.generateKey('weekly', {
        limit: 20,
        metric: 'combined',
      });

      expect(votesKey).not.toBe(bookmarksKey);
      expect(votesKey).not.toBe(combinedKey);
      expect(bookmarksKey).not.toBe(combinedKey);
    });

    it('フィルタフラグを含めたキーを生成する', () => {
      const key = cache.generateKey('weekly', {
        includeEmptyContent: true,
        excludeUnprocessed: true,
        excludeLowQuality: true,
      });

      expect(key).toBe(
        'articles:weekly:emptyContent:1:exUnprocessed:1:exLowQuality:1'
      );
    });

    it('フィルタフラグが false の場合はキーに含めない', () => {
      const key = cache.generateKey('weekly', {
        includeEmptyContent: false,
        excludeUnprocessed: false,
        excludeLowQuality: false,
      });

      expect(key).toBe('articles:weekly');
    });

    it('全オプション指定時のキーを正しく生成する', () => {
      const key = cache.generateKey('monthly', {
        limit: 10,
        sourceId: 'src-1',
        tagId: 'tag-1',
        metric: 'quality',
        includeEmptyContent: true,
        excludeUnprocessed: true,
        excludeLowQuality: true,
      });

      expect(key).toBe(
        'articles:monthly:limit:10:source:src-1:tag:tag-1:metric:quality:emptyContent:1:exUnprocessed:1:exLowQuality:1'
      );
    });
  });

  describe('getOrSet', () => {
    it('fetcher の結果を返す', async () => {
      const result = await cache.getOrSet(
        'weekly',
        async () => ({ articles: [] }),
        { limit: 20, metric: 'combined' }
      );

      expect(result).toEqual({ articles: [] });
    });

    it('存在しない期間でエラーをスローする', async () => {
      await expect(
        cache.getOrSet('invalid' as never, async () => ({}))
      ).rejects.toThrow('Cache not found for period');
    });
  });
});
