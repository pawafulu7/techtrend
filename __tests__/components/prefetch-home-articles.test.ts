/**
 * ホームの1ページ目のサーバー先読み（issue #714）。
 *
 * - クライアント（HomeClientInfinite → useInfiniteArticles）と同じ queryKey に入れる
 * - クライアントと同じ要求を一覧 API のハンドラに渡す（パーソナライズは /api/articles）
 * - 取得に失敗したら何も渡さない（クライアントがこれまでどおり取る）
 */

import type { DehydratedState } from '@tanstack/react-query';

const mockHeaders = new Map<string, string>();
jest.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => mockHeaders.get(name) ?? null,
  }),
}));

const mockGetArticleList = jest.fn();
jest.mock('@/app/api/articles/list/route', () => ({
  GET: (request: unknown) => mockGetArticleList(request),
}));
const mockGetArticles = jest.fn();
jest.mock('@/app/api/articles/handlers', () => ({
  handleGet: (request: unknown) => mockGetArticles(request),
}));
const mockGetPreferences = jest.fn();
jest.mock('@/app/api/user/preferences/categories/route', () => ({
  GET: (request: unknown, context: unknown) =>
    mockGetPreferences(request, context),
}));
const mockWarn = jest.fn();
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    warn: (...args: unknown[]) => mockWarn(...args),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

import { prefetchHomeArticles } from '@/app/components/home/prefetch-home-articles';

const PAGE = {
  success: true,
  data: {
    items: [{ id: 'a1', title: '記事1' }],
    total: 42,
    page: 1,
    totalPages: 3,
    limit: 20,
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function requestUrl(mock: jest.Mock): URL {
  const [request] = mock.mock.calls[0] as [{ url: string }];
  return new URL(request.url);
}

function articleQueries(state: DehydratedState) {
  return state.queries.filter((q) => q.queryKey[0] === 'infinite-articles');
}

const GUEST = null;
const USER = {
  user: { id: 'user-1' },
  session: { token: 't' },
} as unknown as Parameters<typeof prefetchHomeArticles>[0]['session'];

describe('prefetchHomeArticles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHeaders.clear();
    mockHeaders.set('cookie', 'session=abc');
  });

  it('ゲストは軽量版の一覧 API で1ページ目を取り、クライアントと同じキーに置く', async () => {
    mockGetArticleList.mockResolvedValue(jsonResponse(PAGE));

    const { dehydratedState, initialPersonalization } =
      await prefetchHomeArticles({
        searchParams: new URLSearchParams('tags=React&returning=1'),
        initialSortBy: 'qualityScore',
        initialSourceIds: ['s1', 's2'],
        excludeSources: 'arxiv',
        session: GUEST,
      });

    expect(mockGetPreferences).not.toHaveBeenCalled();
    expect(mockGetArticles).not.toHaveBeenCalled();
    const url = requestUrl(mockGetArticleList);
    expect(url.pathname).toBe('/api/articles/list');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      excludeSources: 'arxiv',
      excludeUnprocessed: 'true',
      includeUserData: 'true',
      sortBy: 'qualityScore',
      sources: 's1,s2',
      tags: 'React',
      page: '1',
      limit: '20',
    });
    // Cookie を渡す（お気に入りの L1 キャッシュの迂回 Cookie をハンドラが読むため）
    const [request] = mockGetArticleList.mock.calls[0] as [
      { headers: Headers },
    ];
    expect(request.headers.get('cookie')).toBe('session=abc');

    const [query] = articleQueries(dehydratedState);
    // HomeClientInfinite が作る条件（includeUserData: true を足して正規化）と同じキー
    expect(query.queryKey).toEqual([
      'infinite-articles',
      JSON.stringify({
        excludeSources: 'arxiv',
        excludeUnprocessed: 'true',
        includeUserData: true,
        sortBy: 'qualityScore',
        sources: 's1,s2',
        tags: 'React',
      }),
    ]);
    const data = query.state.data as {
      pages: Array<typeof PAGE & { fetchedAt: number; requestedAt: number }>;
      pageParams: number[];
    };
    expect(data.pageParams).toEqual([1]);
    expect(data.pages[0].data).toEqual(PAGE.data);
    expect(typeof data.pages[0].fetchedAt).toBe('number');
    expect(typeof data.pages[0].requestedAt).toBe('number');
    expect(initialPersonalization).toEqual({
      filterEnabled: false,
      selectedCategories: [],
      periodMonths: 12,
    });
  });

  it('ログイン時はホームの設定でパーソナライズし、/api/articles で取る', async () => {
    mockGetPreferences.mockResolvedValue(
      jsonResponse({
        selectedCategories: ['c1', 'c2'],
        filterEnabled: true,
        periodMonths: 6,
      })
    );
    mockGetArticles.mockResolvedValue(jsonResponse(PAGE));

    const { dehydratedState, initialPersonalization } =
      await prefetchHomeArticles({
        searchParams: new URLSearchParams(''),
        session: USER,
      });

    // ページで判定済みのセッションを渡す
    expect(mockGetPreferences.mock.calls[0][1]).toEqual({ session: USER });
    expect(new URL(mockGetPreferences.mock.calls[0][0].url).search).toBe('');
    expect(mockGetArticleList).not.toHaveBeenCalled();
    const url = requestUrl(mockGetArticles);
    expect(url.pathname).toBe('/api/articles');
    expect(url.searchParams.get('categoryIds')).toBe('c1,c2');
    expect(url.searchParams.get('periodMonths')).toBe('6');
    expect(url.searchParams.get('includeRelations')).toBe('true');

    expect(initialPersonalization).toEqual({
      filterEnabled: true,
      selectedCategories: ['c1', 'c2'],
      periodMonths: 6,
    });
    const [query] = articleQueries(dehydratedState);
    expect(JSON.parse(query.queryKey[1] as string)).toMatchObject({
      categoryIds: 'c1,c2',
      periodMonths: '6',
      personalized: 'true',
    });
  });

  it('ログイン中に設定を読めなければ先読みしない（クライアントが設定を待って取る）', async () => {
    mockGetPreferences.mockResolvedValue(
      jsonResponse({ error: 'Session invalid' }, 401)
    );

    const { dehydratedState, initialPersonalization } =
      await prefetchHomeArticles({
        searchParams: new URLSearchParams(''),
        session: USER,
      });

    expect(mockGetArticleList).not.toHaveBeenCalled();
    expect(mockGetArticles).not.toHaveBeenCalled();
    expect(articleQueries(dehydratedState)).toHaveLength(0);
    expect(initialPersonalization).toBeUndefined();
  });

  it('モバイルの User-Agent では軽量モードで取る', async () => {
    mockHeaders.set('user-agent', 'Mozilla/5.0 (Linux; Android 14) Mobile');
    mockGetArticleList.mockResolvedValue(jsonResponse(PAGE));

    await prefetchHomeArticles({
      searchParams: new URLSearchParams(''),
      session: GUEST,
    });

    expect(requestUrl(mockGetArticleList).searchParams.get('lightweight')).toBe(
      'true'
    );
  });

  it('一覧の取得に失敗したら、記事のクエリを渡さない', async () => {
    mockGetArticleList.mockResolvedValue(jsonResponse({ success: false }, 500));

    const { dehydratedState } = await prefetchHomeArticles({
      searchParams: new URLSearchParams(''),
      session: GUEST,
    });

    expect(articleQueries(dehydratedState)).toHaveLength(0);
  });

  it('ハンドラが例外を投げても描画を止めず、記事のクエリを渡さずにログに残す', async () => {
    mockGetArticleList.mockRejectedValue(new Error('synthetic'));

    const { dehydratedState } = await prefetchHomeArticles({
      searchParams: new URLSearchParams(''),
      session: GUEST,
    });

    expect(articleQueries(dehydratedState)).toHaveLength(0);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' }),
      'Home SSR: the first page of articles is not available'
    );
  });
});
