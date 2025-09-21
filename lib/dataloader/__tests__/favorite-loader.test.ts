// モック宣言を先に
jest.mock('@/lib/prisma');
jest.mock('@/lib/cache/redis-cache');
jest.mock('@/lib/cache/memory-cache', () => ({
  DataLoaderMemoryCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    clear: jest.fn(),
  })),
}));

// DataLoaderを__mocks__ディレクトリのモックで置き換え
jest.mock('dataloader');
import DataLoader from 'dataloader';

import { prisma } from '@/lib/prisma';
import { RedisCache } from '@/lib/cache/redis-cache';
import { createFavoriteLoader, resetFavoriteLoaderCaches } from '../favorite-loader';

// prismaを型アサーション
const prismaMock = prisma as any;

describe('FavoriteLoader', () => {
  const userId = 'user123';

  beforeEach(() => {
    // 各テストの前にキャッシュをリセット（最初に実行）
    resetFavoriteLoaderCaches();

    jest.clearAllMocks();
    // DataLoaderのキャッシュをクリア
    if ((DataLoader as any).clearAllInstances) {
      (DataLoader as any).clearAllInstances();
    }
    // Prismaモックを明確に設定（新しいインスタンスを作成）
    if (prismaMock.favorite) {
      prismaMock.favorite.findMany = jest.fn();
      prismaMock.favorite.findUnique = jest.fn();
    }
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should batch multiple favorite status requests', async () => {
    const mockFavorites = [
      {
        userId,
        articleId: 'article-batch-1',  // ユニークなIDに変更
        createdAt: new Date('2024-01-01')
      },
      {
        userId,
        articleId: 'article-batch-3',  // ユニークなIDに変更
        createdAt: new Date('2024-01-02')
      }
    ];

    prismaMock.favorite.findMany.mockResolvedValue(mockFavorites);

    const loader = createFavoriteLoader(userId);

    const results = await loader.loadMany(['article-batch-1', 'article-batch-2', 'article-batch-3']);

    expect(prismaMock.favorite.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.favorite.findMany).toHaveBeenCalledWith({
      where: {
        userId,
        articleId: {
          in: ['article-batch-1', 'article-batch-2', 'article-batch-3']
        }
      }
    });

    expect(results[0]).toEqual({
      articleId: 'article-batch-1',
      isFavorited: true,
      favoritedAt: new Date('2024-01-01')
    });
    expect(results[1]).toEqual({
      articleId: 'article-batch-2',
      isFavorited: false,
      favoritedAt: undefined
    });
    expect(results[2]).toEqual({
      articleId: 'article-batch-3',
      isFavorited: true,
      favoritedAt: new Date('2024-01-02')
    });
  });

  it('should return false for articles not favorited', async () => {
    prismaMock.favorite.findMany.mockResolvedValue([]);

    const loader = createFavoriteLoader(userId);

    const result = await loader.load('article-not-fav');  // ユニークなIDに変更

    expect(result).toEqual({
      articleId: 'article-not-fav',
      isFavorited: false,
      favoritedAt: undefined
    });
  });

  it('should handle empty article IDs', async () => {
    const loader = createFavoriteLoader(userId);

    const results = await loader.loadMany([]);

    expect(results).toEqual([]);
    expect(prismaMock.favorite.findMany).not.toHaveBeenCalled();
  });

  it('should maintain order of results', async () => {
    const mockFavorites = [
      {
        userId,
        articleId: 'order-3',
        createdAt: new Date('2024-01-03')
      },
      {
        userId,
        articleId: 'order-1',
        createdAt: new Date('2024-01-01')
      }
    ];

    prismaMock.favorite.findMany.mockResolvedValue(mockFavorites);

    const loader = createFavoriteLoader(userId);

    const results = await loader.loadMany(['order-1', 'order-2', 'order-3', 'order-4']);

    expect(results[0].articleId).toBe('order-1');
    expect(results[0].isFavorited).toBe(true);
    expect(results[1].articleId).toBe('order-2');
    expect(results[1].isFavorited).toBe(false);
    expect(results[2].articleId).toBe('order-3');
    expect(results[2].isFavorited).toBe(true);
    expect(results[3].articleId).toBe('order-4');
    expect(results[3].isFavorited).toBe(false);
  });

  it('should cache results by default', async () => {
    const mockFavorite = {
      userId,
      articleId: 'cache-test',
      createdAt: new Date('2024-01-01')
    };

    prismaMock.favorite.findMany.mockResolvedValue([mockFavorite]);

    const loader = createFavoriteLoader(userId);

    const result1 = await loader.load('cache-test');
    const result2 = await loader.load('cache-test');

    // DataLoaderのキャッシュが有効な場合、同じインスタンスを返すはず
    expect(prismaMock.favorite.findMany).toHaveBeenCalledTimes(1);
    // 参照の等価性をチェック
    expect(result1).toEqual(result2);
  });

  it('should not cache when disabled', async () => {
    const mockFavorite = {
      userId,
      articleId: 'no-cache-test',
      createdAt: new Date('2024-01-01')
    };

    prismaMock.favorite.findMany.mockResolvedValue([mockFavorite]);

    const loader = createFavoriteLoader(userId, { cache: false });

    await loader.load('no-cache-test');
    await loader.load('no-cache-test');

    expect(prismaMock.favorite.findMany).toHaveBeenCalledTimes(2);
  });
});