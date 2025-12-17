import type { ArticleQueryParams } from '@/lib/cache/layered-cache';

// グローバルオブジェクトにストレージマップを配置（モック巻き上げ対策）
declare global {
  // eslint-disable-next-line no-var
  var __testCacheStorage: Map<string, Map<string, unknown>> | undefined;
}

// RedisCacheのモック
jest.mock('@/lib/cache/index', () => {
  return {
    RedisCache: jest.fn().mockImplementation((options) => {
      // グローバルストレージを使用
      if (!globalThis.__testCacheStorage) {
        globalThis.__testCacheStorage = new Map();
      }
      const storageMap = globalThis.__testCacheStorage;
      const namespace = options.namespace || 'default';
      if (!storageMap.has(namespace)) {
        storageMap.set(namespace, new Map());
      }
      const storage = storageMap.get(namespace)!;

      return {
        get: jest.fn(async (key: string) => storage.get(key) || null),
        set: jest.fn(async (key: string, value: unknown) => {
          storage.set(key, value);
        }),
        getOrSet: jest.fn(async <T>(key: string, fetcher: () => Promise<T>): Promise<T> => {
          const cached = storage.get(key);
          if (cached) return cached as T;
          const value = await fetcher();
          storage.set(key, value);
          return value;
        }),
        getOrSetWithLock: jest.fn(async <T>(key: string, fetcher: () => Promise<T>): Promise<T> => {
          // Simulate lock behavior - same as getOrSet for testing
          const cached = storage.get(key);
          if (cached) return cached as T;
          const value = await fetcher();
          storage.set(key, value);
          return value;
        }),
        delete: jest.fn(async (key: string) => storage.delete(key)),
        clear: jest.fn(async () => storage.clear()),
        getStats: jest.fn(() => ({ hits: 0, misses: 0 })),
        resetStats: jest.fn(),
      };
    }),
  };
});

// モックされたモジュールをインポート
import { LayeredCache } from '@/lib/cache/layered-cache';

describe('LayeredCache', () => {
  let cache: LayeredCache;

  beforeEach(() => {
    // グローバルストレージをリセット
    globalThis.__testCacheStorage = new Map();
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

    test('異なるsortOrderは異なるキャッシュキーを生成', async () => {
      const paramsAsc: ArticleQueryParams = {
        sortBy: 'publishedAt',
        sortOrder: 'asc',
        page: 1,
        limit: 20,
      };

      const paramsDesc: ArticleQueryParams = {
        sortBy: 'publishedAt',
        sortOrder: 'desc',
        page: 1,
        limit: 20,
      };

      const mockDataAsc = { items: [{ id: 'oldest' }], total: 100 };
      const mockDataDesc = { items: [{ id: 'newest' }], total: 100 };

      const fetcherAsc = jest.fn().mockResolvedValue(mockDataAsc);
      const fetcherDesc = jest.fn().mockResolvedValue(mockDataDesc);

      // asc順で取得
      const resultAsc = await cache.getArticles(paramsAsc, fetcherAsc);
      expect(resultAsc.items[0].id).toBe('oldest');
      expect(fetcherAsc).toHaveBeenCalledTimes(1);

      // desc順で取得（別キャッシュ）
      const resultDesc = await cache.getArticles(paramsDesc, fetcherDesc);
      expect(resultDesc.items[0].id).toBe('newest');
      expect(fetcherDesc).toHaveBeenCalledTimes(1);

      // 再度asc順で取得（キャッシュから）
      const cachedAsc = await cache.getArticles(paramsAsc, fetcherAsc);
      expect(cachedAsc.items[0].id).toBe('oldest');
      expect(fetcherAsc).toHaveBeenCalledTimes(1); // キャッシュヒット
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

  describe('件数キャッシュ（getArticleCount）', () => {
    test('sortByを変更しても同じ件数キャッシュを使用', async () => {
      const params1: ArticleQueryParams = {
        sources: 'dev.to',
        sortBy: 'publishedAt',
        page: 1,
        limit: 20,
      };

      const params2: ArticleQueryParams = {
        sources: 'dev.to',
        sortBy: 'createdAt',
        page: 1,
        limit: 20,
      };

      const fetcher = jest.fn().mockResolvedValue({ total: 100 });

      const result1 = await cache.getArticleCount(params1, fetcher);
      const result2 = await cache.getArticleCount(params2, fetcher);

      expect(result1.total).toBe(100);
      expect(result2.total).toBe(100);
      // sortByが異なっても件数キャッシュは共有されるため、fetcherは1回のみ
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    test('pageとlimitを変更しても同じ件数キャッシュを使用', async () => {
      const params1: ArticleQueryParams = {
        sources: 'dev.to',
        page: 1,
        limit: 20,
      };

      const params2: ArticleQueryParams = {
        sources: 'dev.to',
        page: 5,
        limit: 50,
      };

      const fetcher = jest.fn().mockResolvedValue({ total: 200 });

      const result1 = await cache.getArticleCount(params1, fetcher);
      const result2 = await cache.getArticleCount(params2, fetcher);

      expect(result1.total).toBe(200);
      expect(result2.total).toBe(200);
      // page/limitが異なっても件数キャッシュは共有
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    test('フィルター条件が異なると別のキャッシュを使用', async () => {
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

      const fetcher1 = jest.fn().mockResolvedValue({ total: 100 });
      const fetcher2 = jest.fn().mockResolvedValue({ total: 150 });

      const result1 = await cache.getArticleCount(params1, fetcher1);
      const result2 = await cache.getArticleCount(params2, fetcher2);

      expect(result1.total).toBe(100);
      expect(result2.total).toBe(150);
      // 異なるソースは別キャッシュ
      expect(fetcher1).toHaveBeenCalledTimes(1);
      expect(fetcher2).toHaveBeenCalledTimes(1);
    });

    // 検索キーワードは空白区切りでソートされるため、順序が異なっても同一キーとなる
    test('検索条件が同じなら同じ件数キャッシュを使用（キーワード順序正規化）', async () => {
      const params1: ArticleQueryParams = {
        search: 'React TypeScript',
        sortBy: 'publishedAt',
        page: 1,
        limit: 20,
      };

      const params2: ArticleQueryParams = {
        search: 'TypeScript React', // 順序が異なるが正規化される
        sortBy: 'qualityScore',
        page: 2,
        limit: 50,
      };

      const fetcher = jest.fn().mockResolvedValue({ total: 75 });

      const result1 = await cache.getArticleCount(params1, fetcher);
      const result2 = await cache.getArticleCount(params2, fetcher);

      expect(result1.total).toBe(75);
      expect(result2.total).toBe(75);
      // 検索キーワードが同じ（正規化後）なら共有
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    test('dateRangeが異なると別のキャッシュを使用', async () => {
      const params1: ArticleQueryParams = {
        sources: 'dev.to',
        dateRange: 'week',
        page: 1,
        limit: 20,
      };

      const params2: ArticleQueryParams = {
        sources: 'dev.to',
        dateRange: 'month',
        page: 1,
        limit: 20,
      };

      const fetcher1 = jest.fn().mockResolvedValue({ total: 50 });
      const fetcher2 = jest.fn().mockResolvedValue({ total: 200 });

      const result1 = await cache.getArticleCount(params1, fetcher1);
      const result2 = await cache.getArticleCount(params2, fetcher2);

      expect(result1.total).toBe(50);
      expect(result2.total).toBe(200);
      // 異なるdateRangeは別キャッシュ
      expect(fetcher1).toHaveBeenCalledTimes(1);
      expect(fetcher2).toHaveBeenCalledTimes(1);
    });

    test('タグ条件が異なると別のキャッシュを使用', async () => {
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

      const fetcher1 = jest.fn().mockResolvedValue({ total: 120 });
      const fetcher2 = jest.fn().mockResolvedValue({ total: 80 });

      const result1 = await cache.getArticleCount(params1, fetcher1);
      const result2 = await cache.getArticleCount(params2, fetcher2);

      expect(result1.total).toBe(120);
      expect(result2.total).toBe(80);
      expect(fetcher1).toHaveBeenCalledTimes(1);
      expect(fetcher2).toHaveBeenCalledTimes(1);
    });
  });
});