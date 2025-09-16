import { LayeredCache } from '@/lib/cache/layered-cache';
import type { ArticleQueryParams } from '@/lib/cache/layered-cache';

// RedisCacheのモック
jest.mock('@/lib/cache/index', () => {
  // 各レイヤーごとに異なるストレージを使用
  const storageMap = new Map<string, Map<string, any>>();

  return {
    RedisCache: jest.fn().mockImplementation((options) => {
      const namespace = options.namespace || 'default';
      if (!storageMap.has(namespace)) {
        storageMap.set(namespace, new Map());
      }
      const storage = storageMap.get(namespace)!;

    return {
      get: jest.fn(async (key) => storage.get(key) || null),
      set: jest.fn(async (key, value) => {
        storage.set(key, value);
      }),
      getOrSet: jest.fn(async (key, fetcher) => {
        const cached = storage.get(key);
        if (cached) return cached;
        const value = await fetcher();
        storage.set(key, value);
        return value;
      }),
      delete: jest.fn(async (key) => storage.delete(key)),
      clear: jest.fn(async () => storage.clear()),
      getStats: jest.fn(() => ({ hits: 0, misses: 0 })),
      resetStats: jest.fn(),
    };
  }),
  };
});

describe('LayeredCache', () => {
  let cache: LayeredCache;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new LayeredCache();
  });

  describe('キャッシュレイヤー判定', () => {
    test('基本クエリ（フィルターのみ）はL1キャッシュを使用', async () => {
      const params: ArticleQueryParams = {
        sources: 'dev.to,zenn',
        page: 1,
        limit: 20,
      };

      const mockData = { items: [], total: 100 };
      const fetcher = jest.fn().mockResolvedValue(mockData);

      const result = await cache.getArticles(params, fetcher);

      expect(result).toEqual(mockData);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    test('タグ指定のみはL1キャッシュを使用', async () => {
      const params: ArticleQueryParams = {
        tags: 'React,TypeScript',
        tagMode: 'AND',
        page: 1,
        limit: 20,
      };

      const mockData = { items: [], total: 50 };
      const fetcher = jest.fn().mockResolvedValue(mockData);

      const result = await cache.getArticles(params, fetcher);

      expect(result).toEqual(mockData);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    test('フィルター + タグはL1キャッシュを使用', async () => {
      const params: ArticleQueryParams = {
        sources: 'dev.to',
        tags: 'React',
        dateRange: 'week',
        page: 1,
        limit: 20,
      };

      const mockData = { items: [], total: 25 };
      const fetcher = jest.fn().mockResolvedValue(mockData);

      const result = await cache.getArticles(params, fetcher);

      expect(result).toEqual(mockData);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    test('検索クエリはL3キャッシュを使用', async () => {
      const params: ArticleQueryParams = {
        search: 'Next.js performance',
        page: 1,
        limit: 20,
      };

      const mockData = { items: [], total: 30 };
      const fetcher = jest.fn().mockResolvedValue(mockData);

      const result = await cache.getArticles(params, fetcher);

      expect(result).toEqual(mockData);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    test('検索 + フィルター + タグはL3キャッシュを使用', async () => {
      const params: ArticleQueryParams = {
        search: 'React hooks',
        sources: 'dev.to,zenn',
        tags: 'React,JavaScript',
        tagMode: 'OR',
        dateRange: 'month',
        page: 1,
        limit: 20,
      };

      const mockData = { items: [], total: 15 };
      const fetcher = jest.fn().mockResolvedValue(mockData);

      const result = await cache.getArticles(params, fetcher);

      expect(result).toEqual(mockData);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    test('ユーザー固有クエリはL2キャッシュを使用', async () => {
      const params: ArticleQueryParams = {
        userId: 'user123',
        readFilter: 'unread',
        page: 1,
        limit: 20,
      };

      const mockData = { items: [], total: 40 };
      const fetcher = jest.fn().mockResolvedValue(mockData);

      const result = await cache.getArticles(params, fetcher);

      expect(result).toEqual(mockData);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    test('includeUserDataがtrueの場合はキャッシュを使用しない', async () => {
      const params: ArticleQueryParams = {
        sources: 'dev.to',
        includeUserData: true,
        page: 1,
        limit: 20,
      };

      const mockData = { items: [], total: 60 };
      const fetcher = jest.fn().mockResolvedValue(mockData);

      const result = await cache.getArticles(params, fetcher);

      expect(result).toEqual(mockData);
      expect(fetcher).toHaveBeenCalledTimes(1);

      // 2回目の呼び出しでもfetcherが呼ばれる（キャッシュなし）
      const result2 = await cache.getArticles(params, fetcher);
      expect(result2).toEqual(mockData);
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  describe('キャッシュキーの一意性', () => {
    test('異なるソースフィルターは異なるキャッシュキーを生成', async () => {
      const params1: ArticleQueryParams = {
        sources: 'dev.to',
        page: 1,
        limit: 20,
      };

      const params2: ArticleQueryParams = {
        sources: 'zenn',
        page: 1,
        limit: 20,
      };

      const mockData1 = { items: [], total: 100 };
      const mockData2 = { items: [], total: 200 };

      const fetcher1 = jest.fn().mockResolvedValue(mockData1);
      const fetcher2 = jest.fn().mockResolvedValue(mockData2);

      const result1 = await cache.getArticles(params1, fetcher1);
      const result2 = await cache.getArticles(params2, fetcher2);

      expect(result1.total).toBe(100);
      expect(result2.total).toBe(200);
      expect(fetcher1).toHaveBeenCalledTimes(1);
      expect(fetcher2).toHaveBeenCalledTimes(1);
    });

    test('異なるタグは異なるキャッシュキーを生成', async () => {
      const params1: ArticleQueryParams = {
        tags: 'React',
        page: 1,
        limit: 20,
      };

      const params2: ArticleQueryParams = {
        tags: 'Vue',
        page: 1,
        limit: 20,
      };

      const mockData1 = { items: [], total: 150 };
      const mockData2 = { items: [], total: 75 };

      const fetcher1 = jest.fn().mockResolvedValue(mockData1);
      const fetcher2 = jest.fn().mockResolvedValue(mockData2);

      const result1 = await cache.getArticles(params1, fetcher1);
      const result2 = await cache.getArticles(params2, fetcher2);

      expect(result1.total).toBe(150);
      expect(result2.total).toBe(75);
      expect(fetcher1).toHaveBeenCalledTimes(1);
      expect(fetcher2).toHaveBeenCalledTimes(1);
    });

    test('sources=noneは正しく処理される', async () => {
      const params: ArticleQueryParams = {
        sources: 'none',
        page: 1,
        limit: 20,
      };

      const mockData = { items: [], total: 0 };
      const fetcher = jest.fn().mockResolvedValue(mockData);

      const result = await cache.getArticles(params, fetcher);

      expect(result).toEqual(mockData);
      expect(result.total).toBe(0);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    test('複合条件の組み合わせで正しいキャッシュキーを生成', async () => {
      const params: ArticleQueryParams = {
        sources: 'dev.to,zenn',
        tags: 'React,TypeScript',
        tagMode: 'AND',
        dateRange: 'week',
        category: 'frontend',
        page: 2,
        limit: 30,
      };

      const mockData = { items: [], total: 42 };
      const fetcher = jest.fn().mockResolvedValue(mockData);

      const result = await cache.getArticles(params, fetcher);

      expect(result).toEqual(mockData);
      expect(result.total).toBe(42);
      expect(fetcher).toHaveBeenCalledTimes(1);

      // 同じパラメータで再度呼び出すとキャッシュから返される
      const cachedResult = await cache.getArticles(params, fetcher);
      expect(cachedResult).toEqual(mockData);
      expect(fetcher).toHaveBeenCalledTimes(1); // fetcherは再度呼ばれない
    });
  });

  describe('全ユーザー共通性の検証', () => {
    test('L1キャッシュは全ユーザー共通', async () => {
      const params: ArticleQueryParams = {
        sources: 'dev.to',
        tags: 'React',
        page: 1,
        limit: 20,
      };

      const mockData = { items: [], total: 100 };
      const fetcher = jest.fn().mockResolvedValue(mockData);

      // ユーザーAのリクエスト
      const resultA = await cache.getArticles(params, fetcher);
      expect(resultA).toEqual(mockData);
      expect(fetcher).toHaveBeenCalledTimes(1);

      // ユーザーBのリクエスト（同じパラメータ）
      const resultB = await cache.getArticles(params, fetcher);
      expect(resultB).toEqual(mockData);
      expect(fetcher).toHaveBeenCalledTimes(1); // キャッシュから返されるため、fetcherは呼ばれない
    });

    test('L3キャッシュ（検索）は全ユーザー共通', async () => {
      const params: ArticleQueryParams = {
        search: 'TypeScript',
        sources: 'dev.to',
        tags: 'React',
        page: 1,
        limit: 20,
      };

      const mockData = { items: [], total: 50 };
      const fetcher = jest.fn().mockResolvedValue(mockData);

      // ユーザーAの検索
      const resultA = await cache.getArticles(params, fetcher);
      expect(resultA.total).toBe(50);
      expect(fetcher).toHaveBeenCalledTimes(1);

      // ユーザーBの検索（同じ検索条件）
      const resultB = await cache.getArticles(params, fetcher);
      expect(resultB.total).toBe(50);
      expect(fetcher).toHaveBeenCalledTimes(1); // キャッシュから返される
    });

    test('L2キャッシュはユーザー固有', async () => {
      const paramsUserA: ArticleQueryParams = {
        userId: 'userA',
        readFilter: 'unread',
        page: 1,
        limit: 20,
      };

      const paramsUserB: ArticleQueryParams = {
        userId: 'userB',
        readFilter: 'unread',
        page: 1,
        limit: 20,
      };

      const mockDataA = { items: [], total: 30 };
      const mockDataB = { items: [], total: 45 };

      const fetcherA = jest.fn().mockResolvedValue(mockDataA);
      const fetcherB = jest.fn().mockResolvedValue(mockDataB);

      const resultA = await cache.getArticles(paramsUserA, fetcherA);
      const resultB = await cache.getArticles(paramsUserB, fetcherB);

      expect(resultA.total).toBe(30);
      expect(resultB.total).toBe(45);
      expect(fetcherA).toHaveBeenCalledTimes(1);
      expect(fetcherB).toHaveBeenCalledTimes(1);
    });
  });
});