import { createFavoriteLoader } from '../favorite-loader';
import { prisma } from '@/lib/prisma';

// Prismaモック
jest.mock('@/lib/prisma', () => ({
  prisma: {
    favorite: {
      findMany: jest.fn()
    }
  }
}));

describe('FavoriteLoader', () => {
  const userId = 'user123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should batch multiple favorite status requests', async () => {
    const mockFavorites = [
      {
        userId,
        articleId: '1',
        createdAt: new Date('2024-01-01')
      },
      {
        userId,
        articleId: '3',
        createdAt: new Date('2024-01-02')
      }
    ];

    (prisma.favorite.findMany as jest.Mock).mockResolvedValue(mockFavorites);

    const loader = createFavoriteLoader(userId);

    const results = await loader.loadMany(['1', '2', '3']);

    // 1回のクエリで処理されることを確認
    expect(prisma.favorite.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.favorite.findMany).toHaveBeenCalledWith({
      where: {
        userId,
        articleId: {
          in: ['1', '2', '3']
        }
      }
    });

    // 結果の確認
    expect(results[0]).toEqual({
      articleId: '1',
      isFavorited: true,
      favoritedAt: new Date('2024-01-01')
    });
    expect(results[1]).toEqual({
      articleId: '2',
      isFavorited: false,
      favoritedAt: undefined
    });
    expect(results[2]).toEqual({
      articleId: '3',
      isFavorited: true,
      favoritedAt: new Date('2024-01-02')
    });
  });

  it('should return false for articles not favorited', async () => {
    (prisma.favorite.findMany as jest.Mock).mockResolvedValue([]);

    const loader = createFavoriteLoader(userId);

    const result = await loader.load('1');

    expect(result).toEqual({
      articleId: '1',
      isFavorited: false,
      favoritedAt: undefined
    });
  });

  it('should handle empty article IDs', async () => {
    const loader = createFavoriteLoader(userId);

    const results = await loader.loadMany([]);

    expect(results).toEqual([]);
    expect(prisma.favorite.findMany).not.toHaveBeenCalled();
  });

  it('should maintain order of results', async () => {
    const mockFavorites = [
      {
        userId,
        articleId: '3',
        createdAt: new Date('2024-01-03')
      },
      {
        userId,
        articleId: '1',
        createdAt: new Date('2024-01-01')
      }
    ];

    (prisma.favorite.findMany as jest.Mock).mockResolvedValue(mockFavorites);

    const loader = createFavoriteLoader(userId);

    const results = await loader.loadMany(['1', '2', '3', '4']);

    // 入力順序が保持されることを確認
    expect(results[0].articleId).toBe('1');
    expect(results[0].isFavorited).toBe(true);
    expect(results[1].articleId).toBe('2');
    expect(results[1].isFavorited).toBe(false);
    expect(results[2].articleId).toBe('3');
    expect(results[2].isFavorited).toBe(true);
    expect(results[3].articleId).toBe('4');
    expect(results[3].isFavorited).toBe(false);
  });

  it('should cache results by default', async () => {
    const mockFavorite = {
      userId,
      articleId: '1',
      createdAt: new Date('2024-01-01')
    };

    (prisma.favorite.findMany as jest.Mock).mockResolvedValue([mockFavorite]);

    const loader = createFavoriteLoader(userId);

    const result1 = await loader.load('1');
    const result2 = await loader.load('1');

    // キャッシュが有効なので1回のみクエリ実行
    expect(prisma.favorite.findMany).toHaveBeenCalledTimes(1);
    expect(result1).toBe(result2);
  });

  it('should not cache when disabled', async () => {
    const mockFavorite = {
      userId,
      articleId: '1',
      createdAt: new Date('2024-01-01')
    };

    (prisma.favorite.findMany as jest.Mock).mockResolvedValue([mockFavorite]);

    const loader = createFavoriteLoader(userId, { cache: false });

    await loader.load('1');
    await loader.load('1');

    // キャッシュ無効なので2回クエリ実行
    expect(prisma.favorite.findMany).toHaveBeenCalledTimes(2);
  });
});