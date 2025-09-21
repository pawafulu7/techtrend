// Prismaモックの動作確認用テスト
jest.mock('@/lib/prisma');

import { prisma } from '@/lib/prisma';

describe('Prisma Mock Verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should verify prisma.favorite.findMany mock', async () => {
    const prismaMock = prisma as any;

    console.log('=== Before Setting Mock ===');
    console.log('findMany type:', typeof prismaMock.favorite.findMany);
    console.log('Is mock function:', jest.isMockFunction(prismaMock.favorite.findMany));

    // mockResolvedValueを試す（DeepMockProxyはこのメソッドを持っているはず）
    const testData = [{ id: '1', userId: 'user1', articleId: 'article1' }];

    // 方法1: 既存のモック関数にmockResolvedValueを使う
    if (prismaMock.favorite.findMany.mockResolvedValue) {
      prismaMock.favorite.findMany.mockResolvedValue(testData);
      const result1 = await prismaMock.favorite.findMany();
      console.log('Method 1 result:', result1);
      expect(result1).toEqual(testData);
    }

    // clearして再度テスト
    jest.clearAllMocks();

    // 方法2: jest.fn()で上書き
    prismaMock.favorite.findMany = jest.fn().mockResolvedValue(testData);
    const result2 = await prismaMock.favorite.findMany();
    console.log('Method 2 result:', result2);
    expect(result2).toEqual(testData);

    // 呼び出し回数の確認
    expect(prismaMock.favorite.findMany).toHaveBeenCalledTimes(1);
  });

  it('should test actual DataLoader scenario', async () => {
    const prismaMock = prisma as any;

    // DataLoaderのテストと同じようにモックを設定
    const mockFavorites = [
      {
        userId: 'user123',
        articleId: '1',
        createdAt: new Date('2024-01-01')
      }
    ];

    // 既存のモック関数に値を設定
    prismaMock.favorite.findMany.mockResolvedValue(mockFavorites);

    // 実際の呼び出しをシミュレート
    const result = await prismaMock.favorite.findMany({
      where: {
        userId: 'user123',
        articleId: { in: ['1', '2', '3'] }
      }
    });

    console.log('DataLoader scenario result:', result);
    expect(result).toEqual(mockFavorites);
    expect(prismaMock.favorite.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user123',
        articleId: { in: ['1', '2', '3'] }
      }
    });
  });
});