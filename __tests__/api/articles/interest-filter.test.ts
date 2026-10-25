/**
 * /api/articles の興味の分野の絞り込み（categoryIds・periodMonths）のエンドポイントテスト
 *
 * - 分野は記事の点数（ArticleInterestScore）で絞り、通常の一覧と同じ条件・並び・キャッシュを通す
 * - 期間は分野と一緒のときだけ公開日に掛ける
 * - sortBy=finalScore（前の推薦の並び）を受けても 500 にならない
 */

jest.mock('@/lib/services/tag-service', () => ({
  ...jest.requireActual('@/lib/services/tag-service'),
  findTagIdGroupsByNames: async (names: string[]) =>
    names.map((name) => [`tag-${name.toLowerCase()}`]),
}));
jest.mock('@/lib/auth/get-session');

const mockGetArticles = jest.fn();
const mockGetArticleCount = jest.fn();
jest.mock('@/lib/cache/layered-cache', () => ({
  LayeredCache: jest.fn().mockImplementation(() => ({
    getArticles: (params: unknown, fetcher: () => unknown) =>
      mockGetArticles(params, fetcher),
    getArticleCount: (params: unknown, fetcher: () => unknown) =>
      mockGetArticleCount(params, fetcher),
  })),
}));

jest.mock('@/lib/metrics/performance', () => ({
  MetricsCollector: jest.fn().mockImplementation(() => ({
    startTimer: jest.fn(),
    endTimer: jest.fn().mockReturnValue(10),
    setCacheStatus: jest.fn(),
    addMetricsToHeaders: jest.fn(),
  })),
  withDbTiming: jest.fn(async (_metrics: unknown, fn: () => unknown) => fn()),
  withCacheTiming: jest.fn(async (_metrics: unknown, fn: () => unknown) =>
    fn()
  ),
}));

import { GET } from '@/app/api/articles/route';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth/get-session';
import { NextRequest } from 'next/server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;
const authMock = getSession as jest.MockedFunction<typeof getSession>;

const DAY_MS = 24 * 60 * 60 * 1000;

const get = (query: string) =>
  GET(new NextRequest(`http://localhost/api/articles?${query}`));

/** findMany に渡した where の AND の条件 */
const andConditions = (): Record<string, unknown>[] =>
  prismaMock.article.findMany.mock.calls[0][0].where.AND;

const interestCondition = () =>
  andConditions().find((condition) => 'interestScores' in condition);

const periodCondition = () =>
  andConditions().find(
    (condition) =>
      'publishedAt' in condition &&
      Object.keys(condition).length === 1
  ) as { publishedAt: { gte: Date } } | undefined;

describe('/api/articles - 興味の分野の絞り込み', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authMock.mockResolvedValue(null);
    mockGetArticles.mockImplementation(
      async (_params: unknown, fetcher: () => unknown) => fetcher()
    );
    mockGetArticleCount.mockImplementation(
      async (_params: unknown, fetcher: () => Promise<{ total: number }>) =>
        fetcher()
    );
    prismaMock.article = {
      findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]),
      count: jest.fn().mockResolvedValue(1),
    };
  });

  it('選んだ分野の点数を持つ記事に絞り、期間を公開日に掛けて、新しい順に返す', async () => {
    const before = Date.now();
    const response = await get(
      'categoryIds=cat-2,cat-1,cat-2&periodMonths=3&tags=React'
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.items.map((a: { id: string }) => a.id)).toEqual(['a1']);
    expect(json.data.total).toBe(1);

    // 重複を除いて並べた分野で絞る
    expect(interestCondition()).toEqual({
      interestScores: { some: { categoryId: { in: ['cat-1', 'cat-2'] } } },
    });
    const gte = periodCondition()!.publishedAt.gte;
    expect(before - gte.getTime()).toBeGreaterThanOrEqual(90 * DAY_MS - 1000);
    expect(before - gte.getTime()).toBeLessThanOrEqual(90 * DAY_MS + 1000);

    const args = prismaMock.article.findMany.mock.calls[0][0];
    // ほかの絞り込み（タグ）も一緒に掛かる
    expect(JSON.stringify(args.where)).toContain('tag-react');
    expect(args.orderBy).toEqual([{ publishedAt: 'desc' }, { id: 'desc' }]);
    expect(prismaMock.article.count).toHaveBeenCalledWith({
      where: args.where,
    });
  });

  it('一覧と件数のキャッシュのキーに分野と期間を入れる', async () => {
    await get('categoryIds=cat-2,cat-1&periodMonths=6');

    expect(mockGetArticles.mock.calls[0][0]).toMatchObject({
      interestCategoryIds: 'cat-1,cat-2',
      periodMonths: 6,
    });
    expect(mockGetArticleCount.mock.calls[0][0]).toMatchObject({
      interestCategoryIds: 'cat-1,cat-2',
      periodMonths: 6,
    });
  });

  it('分野を選んだ応答は共有のキャッシュに載せない', async () => {
    const response = await get('categoryIds=cat-1');

    expect(response.headers.get('Cache-Control')).toContain('private');
  });

  it('分野が無ければ、期間（periodMonths）だけを渡しても絞らない', async () => {
    await get('periodMonths=3');

    expect(interestCondition()).toBeUndefined();
    expect(periodCondition()).toBeUndefined();
    expect(mockGetArticles.mock.calls[0][0]).toMatchObject({
      interestCategoryIds: undefined,
      periodMonths: undefined,
    });
  });

  it('期間なし（periodMonths=0）は公開日で絞らない', async () => {
    await get('categoryIds=cat-1&periodMonths=0');

    expect(interestCondition()).toBeDefined();
    expect(periodCondition()).toBeUndefined();
  });

  it('periodMonths は 1200（100 年）までに切り詰め、期間の下限を DB の扱える日時にする', async () => {
    const before = Date.now();
    const response = await get('categoryIds=cat-1&periodMonths=900000');

    expect(response.status).toBe(200);
    const gte = periodCondition()!.publishedAt.gte;
    expect(before - gte.getTime()).toBeGreaterThanOrEqual(
      36000 * DAY_MS - 1000
    );
    expect(before - gte.getTime()).toBeLessThanOrEqual(36000 * DAY_MS + 1000);
  });

  it('未読だけ（readFilter）と一緒に使っても分野で絞る', async () => {
    authMock.mockResolvedValue({
      user: { id: 'user-1' },
    } as Awaited<ReturnType<typeof getSession>>);

    const response = await get('categoryIds=cat-1&readFilter=unread');

    expect(response.status).toBe(200);
    expect(interestCondition()).toBeDefined();
    // ユーザーごとの一覧はキャッシュを通さない
    expect(mockGetArticles).not.toHaveBeenCalled();
  });

  it.each([
    [
      '21 個以上',
      Array.from({ length: 21 }, (_, i) => `cat-${i}`).join(','),
    ],
    ['ID に使えない文字を含む', 'cat-1,cat:2'],
    ['長すぎる ID', 'c'.repeat(65)],
  ])(
    '分野の ID が%sなら 400 を返し、DB を引かない',
    async (_label, categoryIds) => {
      const response = await get(
        `categoryIds=${encodeURIComponent(categoryIds)}`
      );

      expect(response.status).toBe(400);
      expect(prismaMock.article.findMany).not.toHaveBeenCalled();
      expect(mockGetArticles).not.toHaveBeenCalled();
    }
  );

  it('重複を除いて 20 個までなら受け付ける', async () => {
    const categoryIds = Array.from({ length: 20 }, (_, i) => `cat-${i}`);

    const response = await get(
      `categoryIds=${[...categoryIds, ...categoryIds].join(',')}`
    );

    expect(response.status).toBe(200);
  });

  it('sortBy=finalScore を受けても 500 にならず、公開日で並べる', async () => {
    const response = await get('categoryIds=cat-1&sortBy=finalScore');

    expect(response.status).toBe(200);
    expect(prismaMock.article.findMany.mock.calls[0][0].orderBy).toEqual([
      { publishedAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});
