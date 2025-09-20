import { createViewLoader } from '../view-loader';
import { prisma } from '@/lib/prisma';

// Prismaモック
jest.mock('@/lib/prisma', () => ({
  prisma: {
    articleView: {
      findMany: jest.fn()
    }
  }
}));

describe('ViewLoader', () => {
  const userId = 'user123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should batch multiple view status requests', async () => {
    const mockViews = [
      {
        userId,
        articleId: '1',
        isRead: true,
        viewedAt: new Date('2024-01-01'),
        readAt: new Date('2024-01-01')
      },
      {
        userId,
        articleId: '2',
        isRead: false,
        viewedAt: new Date('2024-01-02'),
        readAt: null
      }
    ];

    (prisma.articleView.findMany as jest.Mock).mockResolvedValue(mockViews);

    const loader = createViewLoader(userId);

    const results = await loader.loadMany(['1', '2', '3']);

    // 1回のクエリで処理されることを確認
    expect(prisma.articleView.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.articleView.findMany).toHaveBeenCalledWith({
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
      isViewed: true,
      isRead: true,
      viewedAt: new Date('2024-01-01'),
      readAt: new Date('2024-01-01')
    });
    expect(results[1]).toEqual({
      articleId: '2',
      isViewed: true,
      isRead: false,
      viewedAt: new Date('2024-01-02'),
      readAt: null
    });
    expect(results[2]).toEqual({
      articleId: '3',
      isViewed: false,
      isRead: false,
      viewedAt: undefined,
      readAt: undefined
    });
  });

  it('should return default values for non-viewed articles', async () => {
    (prisma.articleView.findMany as jest.Mock).mockResolvedValue([]);

    const loader = createViewLoader(userId);

    const result = await loader.load('1');

    expect(result).toEqual({
      articleId: '1',
      isViewed: false,
      isRead: false,
      viewedAt: undefined,
      readAt: undefined
    });
  });

  it('should handle articles with partial data', async () => {
    const mockViews = [
      {
        userId,
        articleId: '1',
        isRead: undefined, // 未定義の場合
        viewedAt: null,
        readAt: null
      }
    ];

    (prisma.articleView.findMany as jest.Mock).mockResolvedValue(mockViews);

    const loader = createViewLoader(userId);

    const result = await loader.load('1');

    expect(result).toEqual({
      articleId: '1',
      isViewed: true,
      isRead: false, // undefinedの場合はfalseにフォールバック
      viewedAt: null,
      readAt: null
    });
  });

  it('should maintain order of results', async () => {
    const mockViews = [
      {
        userId,
        articleId: '3',
        isRead: true,
        viewedAt: new Date('2024-01-03'),
        readAt: new Date('2024-01-03')
      },
      {
        userId,
        articleId: '1',
        isRead: false,
        viewedAt: new Date('2024-01-01'),
        readAt: null
      }
    ];

    (prisma.articleView.findMany as jest.Mock).mockResolvedValue(mockViews);

    const loader = createViewLoader(userId);

    const results = await loader.loadMany(['1', '2', '3', '4']);

    // 入力順序が保持されることを確認
    expect(results[0].articleId).toBe('1');
    expect(results[0].isViewed).toBe(true);
    expect(results[1].articleId).toBe('2');
    expect(results[1].isViewed).toBe(false);
    expect(results[2].articleId).toBe('3');
    expect(results[2].isViewed).toBe(true);
    expect(results[3].articleId).toBe('4');
    expect(results[3].isViewed).toBe(false);
  });

  it('should cache results by default', async () => {
    const mockView = {
      userId,
      articleId: '1',
      isRead: true,
      viewedAt: new Date('2024-01-01'),
      readAt: new Date('2024-01-01')
    };

    (prisma.articleView.findMany as jest.Mock).mockResolvedValue([mockView]);

    const loader = createViewLoader(userId);

    const result1 = await loader.load('1');
    const result2 = await loader.load('1');

    // キャッシュが有効なので1回のみクエリ実行
    expect(prisma.articleView.findMany).toHaveBeenCalledTimes(1);
    expect(result1).toBe(result2);
  });

  it('should not cache when disabled', async () => {
    const mockView = {
      userId,
      articleId: '1',
      isRead: true,
      viewedAt: new Date('2024-01-01'),
      readAt: new Date('2024-01-01')
    };

    (prisma.articleView.findMany as jest.Mock).mockResolvedValue([mockView]);

    const loader = createViewLoader(userId, { cache: false });

    await loader.load('1');
    await loader.load('1');

    // キャッシュ無効なので2回クエリ実行
    expect(prisma.articleView.findMany).toHaveBeenCalledTimes(2);
  });

  it('should handle empty article IDs', async () => {
    const loader = createViewLoader(userId);

    const results = await loader.loadMany([]);

    expect(results).toEqual([]);
    expect(prisma.articleView.findMany).not.toHaveBeenCalled();
  });
});