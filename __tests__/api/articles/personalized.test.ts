/**
 * /api/articles のパーソナライズ経路のエンドポイントテスト（#684）
 *
 * - パーソナライズ中も、ユーザーが選んだ絞り込みが推薦候補に掛かる
 * - 推薦がフォールバックしたら、期間（periodMonths）を保って通常検索に切り替える
 * - sortBy=finalScore を通常検索が受けても 500 にならない
 */

jest.mock('@/lib/services/tag-service', () => ({
  ...jest.requireActual('@/lib/services/tag-service'),
  findTagIdGroupsByNames: async (names: string[]) =>
    names.map((name) => [`tag-${name.toLowerCase()}`]),
}));
jest.mock('@/lib/auth/get-session');

const mockGetArticleCount = jest.fn();
jest.mock('@/lib/cache/layered-cache', () => ({
  LayeredCache: jest.fn().mockImplementation(() => ({
    getArticles: jest.fn(async (_params: unknown, fetcher: () => unknown) =>
      fetcher()
    ),
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

const mockFilterArticles = jest.fn();
jest.mock('@/lib/personalization/category-filter-service', () => ({
  categoryFilterService: {
    filterArticles: (...args: unknown[]) => mockFilterArticles(...args),
  },
}));

import { GET } from '@/app/api/articles/route';
import { personalizationCache } from '@/app/api/articles/handlers/personalized-query';
import { prisma } from '@/lib/database';
import { getSession } from '@/lib/auth/get-session';
import { NextRequest } from 'next/server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;
const authMock = getSession as jest.MockedFunction<typeof getSession>;

const DAY_MS = 24 * 60 * 60 * 1000;

const realResult = (ids: string[]) => ({
  articles: ids.map((articleId) => ({
    articleId,
    embeddingSimilarity: 0.9,
    tagBoost: 0,
    recencyDecay: 0,
    finalScore: 0.9,
  })),
  meta: {
    filterMode: 'category',
    appliedCategories: ['cat-1'],
    periodMonths: 0,
    totalMatched: ids.length,
    queryMs: 1,
  },
});

const fallbackResult = {
  articles: [],
  meta: {
    filterMode: 'category',
    appliedCategories: [],
    periodMonths: 3,
    totalMatched: 0,
    queryMs: 1,
  },
};

const get = (query: string) =>
  GET(new NextRequest(`http://localhost/api/articles?${query}`));

describe('/api/articles - パーソナライズ経路', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authMock.mockResolvedValue(null);
    // 推薦の順位のキャッシュはテストごとに空にする
    jest.spyOn(personalizationCache, 'get').mockResolvedValue(null);
    jest.spyOn(personalizationCache, 'set').mockResolvedValue(undefined);
    mockGetArticleCount.mockImplementation(
      async (_params: unknown, fetcher: () => Promise<{ total: number }>) =>
        fetcher()
    );
    prismaMock.article = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
  });

  it('タグを選ぶと、推薦候補のうちタグに合う記事だけを推薦順で返す', async () => {
    mockFilterArticles.mockResolvedValue(realResult(['a1', 'a2', 'a3']));
    // a2 はタグを持たない（結合テーブルの直接の問い合わせ）
    prismaMock.$queryRaw = jest.fn().mockResolvedValue([
      { A: 'a1', B: 'tag-react' },
      { A: 'a3', B: 'tag-react' },
    ]);
    prismaMock.article.findMany
      .mockResolvedValueOnce([{ id: 'a3' }, { id: 'a1' }]) // ID の絞り込み
      .mockResolvedValueOnce([
        { id: 'a3', title: 'A3' },
        { id: 'a1', title: 'A1' },
      ]); // ページの記事取得

    const response = await get('categoryIds=cat-1&tags=React&limit=20');

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.items.map((a: { id: string }) => a.id)).toEqual([
      'a1',
      'a3',
    ]);
    expect(json.data.total).toBe(2);
    expect(mockFilterArticles).toHaveBeenCalledWith(
      expect.objectContaining({ allCandidates: true })
    );
    expect(prismaMock.article.findMany.mock.calls[0][0].where).toMatchObject({
      id: { in: ['a1', 'a3'] },
    });
    // 通常検索には切り替えていない
    expect(prismaMock.article.count).not.toHaveBeenCalled();
  });

  it('sources=none は total=0 を返し、通常検索に切り替えない', async () => {
    const response = await get('categoryIds=cat-1&sources=none');

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.items).toEqual([]);
    expect(json.data.total).toBe(0);
    expect(mockFilterArticles).not.toHaveBeenCalled();
    expect(prismaMock.article.findMany).not.toHaveBeenCalled();
  });

  it('readFilter があるときはパーソナライズしない', async () => {
    authMock.mockResolvedValue({
      user: { id: 'user-1', email: 'u@example.com', name: 'U' },
      session: {
        id: 's1',
        userId: 'user-1',
        token: 'tok',
        expiresAt: new Date(Date.now() + DAY_MS),
      },
    } as Awaited<ReturnType<typeof getSession>>);

    const response = await get('categoryIds=cat-1&readFilter=unread');

    expect(response.status).toBe(200);
    expect(mockFilterArticles).not.toHaveBeenCalled();
  });

  it('推薦がフォールバックしたら、期間を保ち sortBy=finalScore を公開日にして通常検索に切り替える', async () => {
    mockFilterArticles.mockResolvedValue(fallbackResult);
    prismaMock.article.count.mockResolvedValue(1);
    prismaMock.article.findMany.mockResolvedValue([{ id: 'latest' }]);

    const before = Date.now();
    const response = await get(
      'categoryIds=cat-1&periodMonths=3&sortBy=finalScore&tags=React'
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.items.map((a: { id: string }) => a.id)).toEqual([
      'latest',
    ]);

    const args = prismaMock.article.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ publishedAt: 'desc' }, { id: 'desc' }]);
    // 絞り込み（タグ）と期間の下限の両方が掛かる
    expect(JSON.stringify(args.where)).toContain('tag-react');
    const periodCondition = args.where.AND[1];
    const gte: Date = periodCondition.publishedAt.gte;
    expect(before - gte.getTime()).toBeGreaterThanOrEqual(90 * DAY_MS - 1000);
    expect(before - gte.getTime()).toBeLessThanOrEqual(90 * DAY_MS + 1000);

    // 件数キャッシュのキーに期間がないので、キャッシュを通さずに数える
    expect(mockGetArticleCount).not.toHaveBeenCalled();
    expect(prismaMock.article.count).toHaveBeenCalledWith({
      where: args.where,
    });
  });

  it('推薦が例外で失敗しても、期間なし（periodMonths=0）なら件数キャッシュを使う通常検索になる', async () => {
    mockFilterArticles.mockRejectedValue(new Error('boom'));
    prismaMock.article.count.mockResolvedValue(1);
    prismaMock.article.findMany.mockResolvedValue([{ id: 'latest' }]);

    const response = await get('categoryIds=cat-1');

    expect(response.status).toBe(200);
    const args = prismaMock.article.findMany.mock.calls[0][0];
    expect(JSON.stringify(args.where)).not.toContain('"gte"');
    expect(mockGetArticleCount).toHaveBeenCalled();
  });

  it('パーソナライズなしで sortBy=finalScore を受けても 500 にならず、公開日で並べる', async () => {
    const response = await get('sortBy=finalScore');

    expect(response.status).toBe(200);
    expect(prismaMock.article.findMany.mock.calls[0][0].orderBy).toEqual([
      { publishedAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});
