/**
 * リーダーの一覧の1ページ目と最初の記事の本文のサーバー先読み（app/reader/_data/prefetch-reader-articles.ts）。
 *
 * - クライアント（reader-client.tsx）と同じ queryKey に入れる（lib/articles/reader-articles-query.ts）
 * - クライアントと同じ要求を API のハンドラに渡す（パーソナライズは /api/articles）
 * - 最初に開く記事は URL の article か一覧の先頭（クライアントの effectiveSelectedId と同じ）
 * - 取得に失敗したらその部分を渡さない（クライアントがこれまでどおり取る）
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
const mockGetArticleDetail = jest.fn();
jest.mock('@/app/api/articles/[id]/route', () => ({
  GET: (request: unknown, context: unknown) =>
    mockGetArticleDetail(request, context),
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

import { prefetchReaderArticles } from '@/app/reader/_data/prefetch-reader-articles';
import {
  buildReaderFilterParams,
  readerDetailQueryKey,
  readerListQueryKey,
} from '@/lib/articles/reader-articles-query';
import { PAPER_SOURCE_IDS_PARAM } from '@/lib/sources/paper-source';

const PAGE = {
  success: true,
  data: {
    items: [
      { id: 'a1', title: '記事1' },
      { id: 'a2', title: '記事2' },
    ],
    total: 42,
    page: 1,
    totalPages: 3,
    limit: 20,
  },
};
// API は記事の全項目を返す（全文の content やソースの他の項目も）
const DETAIL_FIELDS = {
  id: 'a1',
  title: '記事1',
  translatedTitle: null,
  url: 'https://example.com/a1',
  summary: '要約',
  detailedSummary: '詳細',
  thumbnail: null,
  publishedAt: '2026-11-21T00:00:00.000Z',
  summaryVersion: 8,
  articleType: null,
  source: { id: 's1', name: 'Example', url: 'https://example.com' },
  tags: [{ id: 't1', name: 'React' }],
};
const DETAIL = {
  success: true,
  data: {
    ...DETAIL_FIELDS,
    content: '記事の全文',
    qualityScore: 80,
    source: { ...DETAIL_FIELDS.source, type: 'rss', enabled: true },
    tags: [{ id: 't1', name: 'React', category: 'frontend' }],
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

function queriesOf(state: DehydratedState, name: string) {
  return state.queries.filter((q) => q.queryKey[0] === name);
}

const GUEST = null;
const USER = {
  user: { id: 'user-1' },
  session: { token: 't' },
} as unknown as Parameters<typeof prefetchReaderArticles>[0]['session'];

const NO_PERSONALIZATION = {
  filterEnabled: false,
  selectedCategories: [],
  periodMonths: 12,
};

describe('prefetchReaderArticles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHeaders.clear();
    mockHeaders.set('cookie', 'session=abc');
    mockGetArticleDetail.mockResolvedValue(jsonResponse(DETAIL));
  });

  it('ゲストは軽量版の一覧 API で1ページ目を取り、先頭の記事の本文と一緒にクライアントと同じキーに置く', async () => {
    mockGetArticleList.mockResolvedValue(jsonResponse(PAGE));
    const searchParams = new URLSearchParams('tags=React&readFilter=unread');

    const { dehydratedState, initialPersonalization } =
      await prefetchReaderArticles({
        searchParams,
        initialSortBy: 'qualityScore',
        initialSourceIds: ['s1', 's2'],
        session: GUEST,
      });

    expect(mockGetPreferences).not.toHaveBeenCalled();
    expect(mockGetArticles).not.toHaveBeenCalled();
    const url = requestUrl(mockGetArticleList);
    expect(url.pathname).toBe('/api/articles/list');
    // 既読の絞り込みは条件にしない。並び順は Cookie の値、論文のソースは除く
    expect(Object.fromEntries(url.searchParams)).toEqual({
      excludeSources: PAPER_SOURCE_IDS_PARAM,
      excludeUnprocessed: 'true',
      sortBy: 'qualityScore',
      sortOrder: 'desc',
      sources: 's1,s2',
      tags: 'React',
      page: '1',
      limit: '20',
    });
    const [request] = mockGetArticleList.mock.calls[0] as [
      { headers: Headers },
    ];
    expect(request.headers.get('cookie')).toBe('session=abc');

    // reader-client.tsx が同じ条件で作るキー
    const [list] = queriesOf(dehydratedState, 'reader-articles');
    expect(list.queryKey).toEqual(
      readerListQueryKey(
        buildReaderFilterParams({
          searchParams,
          initialSortBy: 'qualityScore',
          initialSourceIds: ['s1', 's2'],
          personalization: NO_PERSONALIZATION,
        })
      )
    );
    const data = list.state.data as { pages: unknown[]; pageParams: number[] };
    expect(data.pageParams).toEqual([1]);
    expect(data.pages[0]).toEqual(PAGE);

    // 本文は一覧の先頭の記事。リーダーで使う項目だけを渡す（全文は HTML に入れない）
    const [detail] = queriesOf(dehydratedState, 'reader-article-detail');
    expect(detail.queryKey).toEqual(readerDetailQueryKey('a1'));
    expect(detail.state.data).toEqual({ success: true, data: DETAIL_FIELDS });
    expect(mockGetArticleDetail.mock.calls[0][1]).toEqual({
      params: expect.any(Promise),
    });
    await expect(mockGetArticleDetail.mock.calls[0][1].params).resolves.toEqual(
      { id: 'a1' }
    );
    expect(initialPersonalization).toEqual(NO_PERSONALIZATION);
  });

  it('URL で記事を選んでいるときは、その記事の本文を取る', async () => {
    mockGetArticleList.mockResolvedValue(jsonResponse(PAGE));

    const { dehydratedState } = await prefetchReaderArticles({
      searchParams: new URLSearchParams('article=a2'),
      session: GUEST,
    });

    const [detail] = queriesOf(dehydratedState, 'reader-article-detail');
    expect(detail.queryKey).toEqual(readerDetailQueryKey('a2'));
    // 選んでいる記事は一覧の条件に入れない
    expect(requestUrl(mockGetArticleList).searchParams.has('article')).toBe(
      false
    );
  });

  it('記事を選ぶ値が空（?article=）なら本文を取らない（クライアントも取らない）', async () => {
    mockGetArticleList.mockResolvedValue(jsonResponse(PAGE));

    const { dehydratedState } = await prefetchReaderArticles({
      searchParams: new URLSearchParams('article='),
      session: GUEST,
    });

    expect(mockGetArticleDetail).not.toHaveBeenCalled();
    expect(queriesOf(dehydratedState, 'reader-article-detail')).toHaveLength(0);
    expect(queriesOf(dehydratedState, 'reader-articles')).toHaveLength(1);
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
      await prefetchReaderArticles({
        searchParams: new URLSearchParams(''),
        session: USER,
      });

    expect(mockGetPreferences.mock.calls[0][1]).toEqual({ session: USER });
    expect(mockGetArticleList).not.toHaveBeenCalled();
    const url = requestUrl(mockGetArticles);
    expect(url.pathname).toBe('/api/articles');
    expect(url.searchParams.get('categoryIds')).toBe('c1,c2');
    expect(url.searchParams.get('periodMonths')).toBe('6');
    expect(initialPersonalization).toEqual({
      filterEnabled: true,
      selectedCategories: ['c1', 'c2'],
      periodMonths: 6,
    });
    const [list] = queriesOf(dehydratedState, 'reader-articles');
    expect(list.queryKey[1]).toMatchObject({
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
      await prefetchReaderArticles({
        searchParams: new URLSearchParams(''),
        session: USER,
      });

    expect(mockGetArticleList).not.toHaveBeenCalled();
    expect(mockGetArticles).not.toHaveBeenCalled();
    expect(dehydratedState.queries).toHaveLength(0);
    expect(initialPersonalization).toBeUndefined();
  });

  it('URL で選んだ記事の本文は、一覧や設定を取れなくても渡す（条件によらないので並べて取る）', async () => {
    mockGetPreferences.mockResolvedValue(jsonResponse({}, 401));

    const withoutPreferences = await prefetchReaderArticles({
      searchParams: new URLSearchParams('article=a1'),
      session: USER,
    });
    expect(
      queriesOf(withoutPreferences.dehydratedState, 'reader-article-detail')
    ).toHaveLength(1);
    expect(
      queriesOf(withoutPreferences.dehydratedState, 'reader-articles')
    ).toHaveLength(0);

    mockGetArticleList.mockResolvedValue(jsonResponse({ success: false }, 500));
    const withoutList = await prefetchReaderArticles({
      searchParams: new URLSearchParams('article=a1'),
      session: GUEST,
    });
    expect(
      queriesOf(withoutList.dehydratedState, 'reader-article-detail')
    ).toHaveLength(1);
    expect(queriesOf(withoutList.dehydratedState, 'reader-articles')).toHaveLength(
      0
    );
  });

  it('一覧の取得に失敗したら、一覧も本文も渡さずにログに残す', async () => {
    mockGetArticleList.mockResolvedValue(jsonResponse({ success: false }, 500));

    const { dehydratedState } = await prefetchReaderArticles({
      searchParams: new URLSearchParams(''),
      session: GUEST,
    });

    expect(dehydratedState.queries).toHaveLength(0);
    expect(mockGetArticleDetail).not.toHaveBeenCalled();
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' }),
      'Reader SSR: the first page of articles is not available'
    );
  });

  it('本文を取れなければ一覧だけを渡す。見つからない記事（404）はログに残さない', async () => {
    mockGetArticleList.mockResolvedValue(jsonResponse(PAGE));
    mockGetArticleDetail.mockResolvedValue(
      jsonResponse({ success: false, error: 'Article not found' }, 404)
    );

    const { dehydratedState } = await prefetchReaderArticles({
      searchParams: new URLSearchParams(''),
      session: GUEST,
    });

    expect(queriesOf(dehydratedState, 'reader-articles')).toHaveLength(1);
    expect(queriesOf(dehydratedState, 'reader-article-detail')).toHaveLength(0);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('本文の取得が 404 以外で失敗したらログに残す', async () => {
    mockGetArticleList.mockResolvedValue(jsonResponse(PAGE));
    mockGetArticleDetail.mockRejectedValue(new Error('synthetic'));

    const { dehydratedState } = await prefetchReaderArticles({
      searchParams: new URLSearchParams(''),
      session: GUEST,
    });

    expect(queriesOf(dehydratedState, 'reader-article-detail')).toHaveLength(0);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' }),
      'Reader SSR: the first article is not available'
    );
  });
});
