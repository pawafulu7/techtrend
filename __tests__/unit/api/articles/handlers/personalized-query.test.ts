/**
 * personalized-query（推薦候補に絞り込みを掛けて推薦順にページを切る）の単体テスト（#684）
 */

const mockFilterArticles = jest.fn();
jest.mock('@/lib/personalization/category-filter-service', () => ({
  categoryFilterService: {
    filterArticles: (...args: unknown[]) => mockFilterArticles(...args),
  },
}));

// タグ名は lower(name) で ID にしてから絞る（#681）。テストでは名前の小文字から ID を作り、
// unknown で始まる名前は解決できない（空の組）とする
jest.mock('@/lib/services/tag-service', () => ({
  ...jest.requireActual('@/lib/services/tag-service'),
  findTagIdGroupsByNames: async (names: string[]) =>
    names.map((name) =>
      name.startsWith('unknown') ? [] : [`tag-${name.toLowerCase()}`]
    ),
}));

jest.mock('@/lib/metrics/performance', () => ({
  MetricsCollector: jest.fn().mockImplementation(() => ({})),
  withDbTiming: jest.fn(async (_metrics: unknown, fn: () => unknown) => fn()),
  withCacheTiming: jest.fn(async (_metrics: unknown, fn: () => unknown) =>
    fn()
  ),
}));

import {
  buildPersonalizedCacheKey,
  executePersonalizedQuery,
  personalizationCache,
} from '@/app/api/articles/handlers/personalized-query';
import { prisma } from '@/lib/prisma';
import { MetricsCollector } from '@/lib/metrics/performance';
import type {
  FilterParams,
  ParsedQueryParams,
  PaginationParams,
} from '@/app/api/articles/lib';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

function buildParams(
  overrides: {
    pagination?: Partial<PaginationParams>;
    filters?: FilterParams;
    categoryIds?: string[];
    periodMonths?: number;
  } = {}
): ParsedQueryParams {
  return {
    pagination: {
      page: 1,
      limit: 2,
      sortBy: 'finalScore',
      sortOrder: 'desc',
      ...overrides.pagination,
    },
    filters: overrides.filters ?? {},
    display: {
      includeRelations: false,
      includeEmptyContent: false,
      excludeUnprocessed: false,
      lightweight: false,
      includeUserData: false,
    },
    personalization: {
      categoryIds: overrides.categoryIds ?? ['cat-1'],
      periodMonths: overrides.periodMonths ?? 12,
    },
    normalizedSearch: 'none',
    normalizedSources: 'all',
  };
}

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
    periodMonths: 12,
    totalMatched: ids.length,
    queryMs: 1,
  },
});

/**
 * findMany のモック。1 回目（ID の絞り込み）は条件に合う ID を、
 * 2 回目以降（ページの記事取得）は where.id.in の記事を DB の順（逆順）で返す
 */
function mockArticleQueries(matchingIds: string[]) {
  prismaMock.article.findMany.mockImplementation(
    async (args: { where: { id: { in: string[] } }; select: unknown }) => {
      const requested = args.where.id.in.filter((id) =>
        matchingIds.includes(id)
      );
      const isIdOnly =
        JSON.stringify(args.select) === JSON.stringify({ id: true });
      return requested
        .slice()
        .reverse()
        .map((id) => (isIdOnly ? { id } : { id, title: `title-${id}` }));
    }
  );
}

describe('executePersonalizedQuery', () => {
  const metrics = new MetricsCollector();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  let mockCacheGet: jest.SpyInstance;
  let mockCacheSet: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet = jest
      .spyOn(personalizationCache, 'get')
      .mockResolvedValue(null);
    mockCacheSet = jest
      .spyOn(personalizationCache, 'set')
      .mockResolvedValue(undefined);
    prismaMock.article.findMany = jest.fn();
    prismaMock.$queryRaw = jest.fn().mockResolvedValue([]);
  });

  /** 結合テーブルの直接の問い合わせ（filterIdsByTags）が返すリンク */
  const mockTagLinks = (links: Array<[string, string]>) =>
    prismaMock.$queryRaw.mockResolvedValue(links.map(([A, B]) => ({ A, B })));

  it('全候補に表示条件と絞り込みを掛け、推薦順のまま total を数えてページを切る', async () => {
    mockFilterArticles.mockResolvedValue(
      realResult(['a1', 'a2', 'a3', 'a4', 'a5'])
    );
    // a4 はタグがなく、a2 は検索語に合わない
    mockTagLinks([
      ['a1', 'tag-react'],
      ['a2', 'tag-react'],
      ['a3', 'tag-react'],
      ['a5', 'tag-react'],
    ]);
    mockArticleQueries(['a1', 'a3', 'a4', 'a5']);

    const result = await executePersonalizedQuery(
      buildParams({ filters: { tags: 'React', search: 'hooks' } }),
      metrics
    );

    expect(result).toEqual({
      items: [
        { id: 'a1', title: 'title-a1' },
        { id: 'a3', title: 'title-a3' },
      ],
      total: 3,
      page: 1,
      limit: 2,
      totalPages: 2,
    });

    // 推薦サービスにはページを切らない全候補を頼む
    expect(mockFilterArticles).toHaveBeenCalledWith(
      expect.objectContaining({ allCandidates: true, categoryIds: ['cat-1'] })
    );
    expect(mockFilterArticles.mock.calls[0][0]).not.toHaveProperty('offset');

    const [filterCall, pageCall] = prismaMock.article.findMany.mock.calls;
    const filterWhere = filterCall[0].where;
    expect(filterWhere).toMatchObject({
      isHidden: false,
      summaryComputedAt: { not: null },
      source: { enabled: true },
      // タグに合う候補だけを推薦順で渡す
      id: { in: ['a1', 'a2', 'a3', 'a5'] },
    });
    // タグは記事の EXISTS ではなく結合テーブルの直接の問い合わせで絞る
    expect(filterWhere).not.toHaveProperty('tags');
    const [sql] = prismaMock.$queryRaw.mock.calls[0];
    expect(sql.values).toEqual([['a1', 'a2', 'a3', 'a4', 'a5'], ['tag-react']]);
    expect(JSON.stringify(filterWhere.AND)).toContain('hooks');
    expect(filterCall[0].select).toEqual({ id: true });

    // ページの記事取得にも同じ条件を掛ける
    const pageWhere = pageCall[0].where;
    expect(pageWhere).toEqual({ ...filterWhere, id: { in: ['a1', 'a3'] } });
  });

  it('tagMode=AND はすべてのタグを持つ候補だけを残す', async () => {
    mockFilterArticles.mockResolvedValue(realResult(['a1', 'a2', 'a3']));
    mockTagLinks([
      ['a1', 'tag-react'],
      ['a1', 'tag-typescript'],
      ['a2', 'tag-react'],
      ['a3', 'tag-typescript'],
    ]);
    mockArticleQueries(['a1', 'a2', 'a3']);

    const result = await executePersonalizedQuery(
      buildParams({ filters: { tags: 'React,TypeScript', tagMode: 'AND' } }),
      metrics
    );

    expect(result?.items.map((a) => a.id)).toEqual(['a1']);
    expect(result?.total).toBe(1);
  });

  it('tagMode=OR はどれかのタグを持つ候補を残す', async () => {
    mockFilterArticles.mockResolvedValue(realResult(['a1', 'a2', 'a3', 'a4']));
    mockTagLinks([
      ['a1', 'tag-react'],
      ['a3', 'tag-typescript'],
    ]);
    mockArticleQueries(['a1', 'a2', 'a3', 'a4']);

    const result = await executePersonalizedQuery(
      buildParams({ filters: { tags: 'React,TypeScript' } }),
      metrics
    );

    expect(result?.items.map((a) => a.id)).toEqual(['a1', 'a3']);
    expect(result?.total).toBe(2);
  });

  it('タグを持つ候補がなければ、記事を引かずに total=0 を返す', async () => {
    mockFilterArticles.mockResolvedValue(realResult(['a1', 'a2']));
    mockTagLinks([]);

    const result = await executePersonalizedQuery(
      buildParams({ filters: { tags: 'React' } }),
      metrics
    );

    expect(result).toMatchObject({ items: [], total: 0, totalPages: 0 });
    expect(prismaMock.article.findMany).not.toHaveBeenCalled();
  });

  it('どのタグ名も解決できなければ、推薦も結合テーブルも記事も引かずに total=0 を返す', async () => {
    mockFilterArticles.mockResolvedValue(realResult(['a1', 'a2']));

    const result = await executePersonalizedQuery(
      buildParams({ filters: { tags: 'unknown-tag' } }),
      metrics
    );

    expect(result).toMatchObject({ items: [], total: 0, totalPages: 0 });
    expect(mockFilterArticles).not.toHaveBeenCalled();
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(prismaMock.article.findMany).not.toHaveBeenCalled();
  });

  it('tagMode=AND で 1 つでも解決できないタグがあれば total=0', async () => {
    mockFilterArticles.mockResolvedValue(realResult(['a1']));
    mockTagLinks([['a1', 'tag-react']]);
    mockArticleQueries(['a1']);

    const result = await executePersonalizedQuery(
      buildParams({ filters: { tags: 'React,unknown-tag', tagMode: 'AND' } }),
      metrics
    );

    expect(result).toMatchObject({ items: [], total: 0 });
    expect(mockFilterArticles).not.toHaveBeenCalled();
  });

  it('tagMode=OR は解決できたタグだけで絞る', async () => {
    mockFilterArticles.mockResolvedValue(realResult(['a1', 'a2']));
    mockTagLinks([['a2', 'tag-react']]);
    mockArticleQueries(['a1', 'a2']);

    const result = await executePersonalizedQuery(
      buildParams({ filters: { tags: 'unknown-tag,React' } }),
      metrics
    );

    expect(result?.items.map((a) => a.id)).toEqual(['a2']);
  });

  it('ID を絞った後にタグが外れた記事は、ページの取得で除く', async () => {
    mockFilterArticles.mockResolvedValue(realResult(['a1', 'a2']));
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        { A: 'a1', B: 'tag-react' },
        { A: 'a2', B: 'tag-react' },
      ])
      // ページの取得の直前に a1 のタグが外れた
      .mockResolvedValueOnce([{ A: 'a2', B: 'tag-react' }]);
    mockArticleQueries(['a1', 'a2']);

    const result = await executePersonalizedQuery(
      buildParams({ filters: { tags: 'React' } }),
      metrics
    );

    expect(result?.items.map((a) => a.id)).toEqual(['a2']);
    expect(prismaMock.$queryRaw.mock.calls[1][0].values[0]).toEqual([
      'a1',
      'a2',
    ]);
  });

  it('カテゴリ・期間・低品質の除外・ソースの指定も条件に入る', async () => {
    mockFilterArticles.mockResolvedValue(realResult(['a1']));
    mockArticleQueries(['a1']);

    await executePersonalizedQuery(
      buildParams({
        filters: {
          category: 'frontend',
          dateRange: 'week',
          excludeLowQuality: true,
          sourceId: 'src-zenn',
        },
      }),
      metrics
    );

    const where = prismaMock.article.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      category: 'frontend',
      sourceId: 'src-zenn',
      publishedAt: { gte: expect.any(Date), lte: expect.any(Date) },
    });
    // 低品質の除外は AND に積まれる
    expect(JSON.stringify(where.AND)).toContain('qualityScore');
  });

  it('キャッシュの値が壊れていれば使わずに推薦を計算し直す', async () => {
    mockCacheGet.mockResolvedValue({ ids: [1, 2] });
    mockFilterArticles.mockResolvedValue(realResult(['a1']));
    mockArticleQueries(['a1']);

    const result = await executePersonalizedQuery(buildParams(), metrics);

    expect(mockFilterArticles).toHaveBeenCalled();
    expect(result?.items.map((a) => a.id)).toEqual(['a1']);
  });

  it('除外ソースは推薦候補の抽出に渡さず、後段の条件で除く', async () => {
    mockFilterArticles.mockResolvedValue(realResult(['a1']));
    mockArticleQueries(['a1']);

    await executePersonalizedQuery(
      buildParams({ filters: { excludeSources: 'src-arxiv' } }),
      metrics
    );

    expect(mockFilterArticles.mock.calls[0][0]).not.toHaveProperty(
      'excludeSourceIds'
    );
    expect(prismaMock.article.findMany.mock.calls[0][0].where).toMatchObject({
      sourceId: { notIn: ['src-arxiv'] },
    });
  });

  it('タグを選ばなければ結合テーブルを引かない', async () => {
    mockFilterArticles.mockResolvedValue(realResult(['a1']));
    mockArticleQueries(['a1']);

    await executePersonalizedQuery(buildParams(), metrics);

    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('2 ページ目は絞り込み後の順位で続きを返す', async () => {
    mockFilterArticles.mockResolvedValue(
      realResult(['a1', 'a2', 'a3', 'a4', 'a5'])
    );
    mockArticleQueries(['a1', 'a3', 'a5']);

    const result = await executePersonalizedQuery(
      buildParams({ pagination: { page: 2 } }),
      metrics
    );

    expect(result?.items).toEqual([{ id: 'a5', title: 'title-a5' }]);
    expect(result?.total).toBe(3);
    expect(result?.totalPages).toBe(2);
  });

  it('最終ページを超えると、正しい total のまま空の items を返す（通常検索に切り替えない）', async () => {
    mockFilterArticles.mockResolvedValue(realResult(['a1', 'a2', 'a3']));
    mockArticleQueries(['a1', 'a2', 'a3']);

    const result = await executePersonalizedQuery(
      buildParams({ pagination: { page: 5 } }),
      metrics
    );

    expect(result).toEqual({
      items: [],
      total: 3,
      page: 5,
      limit: 2,
      totalPages: 2,
    });
    // ページの記事取得はしない
    expect(prismaMock.article.findMany).toHaveBeenCalledTimes(1);
  });

  it('絞り込みに合う候補がなければ、null ではなく total=0 の結果を返す', async () => {
    mockFilterArticles.mockResolvedValue(realResult(['a1', 'a2']));
    mockArticleQueries([]);

    const result = await executePersonalizedQuery(
      buildParams({ filters: { search: 'nothing' } }),
      metrics
    );

    expect(result).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 2,
      totalPages: 0,
    });
  });

  it('sources=none は推薦も DB も引かずに空の結果を返す', async () => {
    const result = await executePersonalizedQuery(
      buildParams({ filters: { sources: 'none' } }),
      metrics
    );

    expect(result).toMatchObject({ items: [], total: 0 });
    expect(mockFilterArticles).not.toHaveBeenCalled();
    expect(prismaMock.article.findMany).not.toHaveBeenCalled();
  });

  it('推薦がフォールバックしたら null を返し、キャッシュしない', async () => {
    mockFilterArticles.mockResolvedValue({
      articles: [],
      meta: {
        filterMode: 'category',
        appliedCategories: [],
        periodMonths: 12,
        totalMatched: 0,
        queryMs: 1,
      },
    });

    const result = await executePersonalizedQuery(buildParams(), metrics);

    expect(result).toBeNull();
    expect(mockCacheSet).not.toHaveBeenCalled();
    expect(prismaMock.article.findMany).not.toHaveBeenCalled();
  });

  it('一部のカテゴリの検索が失敗した結果は使うが、キャッシュしない', async () => {
    const partial = realResult(['a1']);
    mockFilterArticles.mockResolvedValue({
      ...partial,
      meta: { ...partial.meta, partialFailure: true },
    });
    mockArticleQueries(['a1']);

    const result = await executePersonalizedQuery(buildParams(), metrics);

    expect(result?.items.map((a) => a.id)).toEqual(['a1']);
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it('全候補の ID が空なら null を返す', async () => {
    mockFilterArticles.mockResolvedValue(realResult([]));

    const result = await executePersonalizedQuery(buildParams(), metrics);

    expect(result).toBeNull();
    expect(prismaMock.article.findMany).not.toHaveBeenCalled();
  });

  it('例外が起きたら null を返す', async () => {
    mockFilterArticles.mockRejectedValue(new Error('boom'));

    const result = await executePersonalizedQuery(buildParams(), metrics);

    expect(result).toBeNull();
  });

  it('全候補の ID を ids:v2: のキーでキャッシュし、ページが違っても同じキーを使う', async () => {
    mockFilterArticles.mockResolvedValue(realResult(['a1', 'a2', 'a3']));
    mockArticleQueries(['a1', 'a2', 'a3']);

    await executePersonalizedQuery(
      buildParams({ pagination: { page: 1 } }),
      metrics
    );
    await executePersonalizedQuery(
      buildParams({ pagination: { page: 2 } }),
      metrics
    );

    const keys = mockCacheGet.mock.calls.map((call) => call[0]);
    expect(keys[0]).toMatch(/^ids:v2:/);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).not.toMatch(/page|lim/);
    expect(mockCacheSet).toHaveBeenCalledWith(keys[0], {
      ids: ['a1', 'a2', 'a3'],
    });
  });

  it('キャッシュ済みの ID を使い、条件外（非表示・無効ソース）になった記事は除く', async () => {
    mockCacheGet.mockResolvedValue({ ids: ['a1', 'hidden', 'a3'] });
    // DB 側の条件（isHidden=false・有効ソース）で hidden は返らない
    mockArticleQueries(['a1', 'a3']);

    const result = await executePersonalizedQuery(buildParams(), metrics);

    expect(mockFilterArticles).not.toHaveBeenCalled();
    expect(result?.items.map((a) => a.id)).toEqual(['a1', 'a3']);
    expect(result?.total).toBe(2);
  });
});

describe('buildPersonalizedCacheKey', () => {
  const base = {
    categoryIds: ['cat-b', 'cat-a'],
    periodMonths: 6,
    sortBy: 'finalScore' as const,
    sortOrder: 'desc' as const,
  };

  it('categoryIds の順序と重複に依存しない', () => {
    expect(buildPersonalizedCacheKey(base)).toBe(
      buildPersonalizedCacheKey({
        ...base,
        categoryIds: ['cat-a', 'cat-b', 'cat-a'],
      })
    );
  });

  it('期間・並べ替えが違えば別のキーになる', () => {
    const key = buildPersonalizedCacheKey(base);
    expect(buildPersonalizedCacheKey({ ...base, periodMonths: 3 })).not.toBe(
      key
    );
    expect(buildPersonalizedCacheKey({ ...base, sortOrder: 'asc' })).not.toBe(
      key
    );
    expect(
      buildPersonalizedCacheKey({ ...base, sortBy: 'publishedAt' })
    ).not.toBe(key);
  });

  it('区切り文字を含む値どうしが同じキーにならない', () => {
    expect(
      buildPersonalizedCacheKey({ ...base, categoryIds: ['a,b'] })
    ).not.toBe(buildPersonalizedCacheKey({ ...base, categoryIds: ['a', 'b'] }));
  });
});
