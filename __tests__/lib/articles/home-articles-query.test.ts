/**
 * ホームの記事一覧の取得条件・queryKey・API 要求の組み立て（issue #714）。
 *
 * サーバーでの1ページ目の先読みとクライアントが同じ関数でキーを作るので、
 * ここで決めた形が変わると hydration 後に1ページ目を取り直すことになる。
 */

import {
  buildArticlesRequest,
  buildHomeArticleFilters,
  infiniteArticlesQueryKey,
  normalizeArticleFilters,
} from '@/lib/articles/home-articles-query';
import {
  ARXIV_SOURCE_ID,
  HUGGINGFACE_PAPERS_SOURCE_ID,
} from '@/lib/constants/source-categories';

const NO_PERSONALIZATION = {
  filterEnabled: false,
  selectedCategories: [],
  periodMonths: 12,
};

describe('buildHomeArticleFilters', () => {
  it('URL の条件を写し、page・limit・returning は取得条件にしない', () => {
    const filters = buildHomeArticleFilters({
      searchParams: new URLSearchParams(
        'tags=React&page=3&limit=50&returning=1&search=next'
      ),
      personalization: NO_PERSONALIZATION,
    });

    expect(filters).toEqual({
      tags: 'React',
      search: 'next',
      excludeUnprocessed: 'true',
    });
  });

  it('URL に sortBy が無いときだけ Cookie の並び順を使う', () => {
    expect(
      buildHomeArticleFilters({
        searchParams: new URLSearchParams(''),
        initialSortBy: 'qualityScore',
        personalization: NO_PERSONALIZATION,
      }).sortBy
    ).toBe('qualityScore');
    expect(
      buildHomeArticleFilters({
        searchParams: new URLSearchParams('sortBy=createdAt'),
        initialSortBy: 'qualityScore',
        personalization: NO_PERSONALIZATION,
      }).sortBy
    ).toBe('createdAt');
  });

  it('ソースは URL の sources・sourceId を Cookie より優先し、空の Cookie は none にする', () => {
    const build = (query: string, initialSourceIds?: string[]) =>
      buildHomeArticleFilters({
        searchParams: new URLSearchParams(query),
        initialSourceIds,
        personalization: NO_PERSONALIZATION,
      });

    expect(build('sources=a,b', ['c']).sources).toBe('a,b');
    expect(build('sourceId=x', ['c'])).toMatchObject({ sourceId: 'x' });
    expect(build('sourceId=x', ['c']).sources).toBeUndefined();
    expect(build('', ['c', 'd']).sources).toBe('c,d');
    expect(build('', []).sources).toBe('none');
    expect(build('', undefined).sources).toBeUndefined();
  });

  it('パーソナライズは有効でカテゴリがあるときだけ足し、期間 0 は送らない', () => {
    const build = (personalization: typeof NO_PERSONALIZATION) =>
      buildHomeArticleFilters({
        searchParams: new URLSearchParams(''),
        personalization,
      });

    expect(
      build({
        filterEnabled: true,
        selectedCategories: ['c1', 'c2'],
        periodMonths: 6,
      })
    ).toMatchObject({
      personalized: 'true',
      categoryIds: 'c1,c2',
      periodMonths: '6',
    });
    expect(
      build({
        filterEnabled: true,
        selectedCategories: ['c1'],
        periodMonths: 0,
      }).periodMonths
    ).toBeUndefined();
    expect(
      build({
        filterEnabled: false,
        selectedCategories: ['c1'],
        periodMonths: 6,
      }).categoryIds
    ).toBeUndefined();
    expect(
      build({ filterEnabled: true, selectedCategories: [], periodMonths: 6 })
        .personalized
    ).toBeUndefined();
  });

  it('カテゴリは順序に依らず同じ条件にする（設定 API は順序を決めていない）', () => {
    const build = (selectedCategories: string[]) =>
      buildHomeArticleFilters({
        searchParams: new URLSearchParams(''),
        personalization: { filterEnabled: true, selectedCategories, periodMonths: 6 },
      }).categoryIds;

    expect(build(['c2', 'c1'])).toBe('c1,c2');
    expect(build(['c1', 'c2'])).toBe('c1,c2');
  });

  it('URL の sources から論文のソースを除き、残りが無ければ sources を送らない（全選択）', () => {
    const sources = (query: string) =>
      buildHomeArticleFilters({
        searchParams: new URLSearchParams(query),
        personalization: NO_PERSONALIZATION,
      }).sources;

    expect(sources(`sources=${HUGGINGFACE_PAPERS_SOURCE_ID}`)).toBeUndefined();
    expect(
      sources(`sources=${ARXIV_SOURCE_ID},${HUGGINGFACE_PAPERS_SOURCE_ID}`)
    ).toBeUndefined();
    expect(sources(`sources=zenn,${HUGGINGFACE_PAPERS_SOURCE_ID},qiita`)).toBe(
      'zenn,qiita'
    );
    expect(sources('sources=all')).toBe('all');
    expect(sources('sources=none')).toBe('none');
  });

  it('URL の sourceId が論文のソースなら送らない（全選択）', () => {
    const build = (query: string) =>
      buildHomeArticleFilters({
        searchParams: new URLSearchParams(query),
        personalization: NO_PERSONALIZATION,
      });

    expect(build(`sourceId=${HUGGINGFACE_PAPERS_SOURCE_ID}`)).not.toHaveProperty(
      'sourceId'
    );
    expect(build('sourceId=zenn').sourceId).toBe('zenn');
  });

  it('除外するソースを足す', () => {
    expect(
      buildHomeArticleFilters({
        searchParams: new URLSearchParams(''),
        personalization: NO_PERSONALIZATION,
        excludeSources: 'arxiv',
      }).excludeSources
    ).toBe('arxiv');
  });
});

describe('normalizeArticleFilters / infiniteArticlesQueryKey', () => {
  it('空の値と returning を除き、キーの順番に依らず同じ queryKey にする', () => {
    const a = normalizeArticleFilters({
      tags: 'React',
      includeUserData: true,
      returning: '1',
      search: '',
      sortBy: undefined,
    });
    const b = normalizeArticleFilters({ includeUserData: true, tags: 'React' });

    expect(infiniteArticlesQueryKey(a)).toEqual(infiniteArticlesQueryKey(b));
    expect(infiniteArticlesQueryKey(a)).toEqual([
      'infinite-articles',
      '{"includeUserData":true,"tags":"React"}',
    ]);
  });
});

describe('buildArticlesRequest', () => {
  it('既読・パーソナライズが無ければ軽量版の一覧 API を使う', () => {
    const { endpoint, searchParams } = buildArticlesRequest(
      normalizeArticleFilters({ tags: 'React', includeUserData: true }),
      { page: 1 }
    );

    expect(endpoint).toBe('/api/articles/list');
    expect(Object.fromEntries(searchParams)).toEqual({
      tags: 'React',
      includeUserData: 'true',
      page: '1',
      limit: '20',
    });
  });

  it('パーソナライズ・既読フィルタでは /api/articles を関連つきで使う', () => {
    const personalized = buildArticlesRequest(
      normalizeArticleFilters({ categoryIds: 'c1', periodMonths: '6' }),
      { page: 1 }
    );
    expect(personalized.endpoint).toBe('/api/articles');
    expect(personalized.searchParams.get('includeRelations')).toBe('true');

    const read = buildArticlesRequest(
      normalizeArticleFilters({ readFilter: 'unread' }),
      { page: 1 }
    );
    expect(read.endpoint).toBe('/api/articles');
    expect(read.searchParams.get('includeUserData')).toBe('true');
  });

  it('総件数は2ページ目以降だけ送り、軽量モードは指定のときだけ付ける', () => {
    const first = buildArticlesRequest({}, { page: 1, total: 100 });
    expect(first.searchParams.has('total')).toBe(false);
    expect(first.searchParams.has('lightweight')).toBe(false);

    const second = buildArticlesRequest(
      {},
      { page: 2, total: 100, lightweight: true }
    );
    expect(second.searchParams.get('total')).toBe('100');
    expect(second.searchParams.get('lightweight')).toBe('true');
  });
});
