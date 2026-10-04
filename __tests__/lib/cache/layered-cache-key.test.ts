import {
  LayeredCache,
  type ArticleQueryParams,
} from '@/lib/cache/layered-cache';
import {
  buildSelectFields,
  buildWhereClause,
} from '@/app/api/articles/lib/query-builder';
import {
  toArticleQueryParams,
  type ArticleCacheParams,
  type DisplayOptions,
} from '@/app/api/articles/lib/types';
import { MetricsCollector } from '@/lib/metrics/performance';

jest.mock('@/lib/services/tag-service', () => ({
  findTagIdGroupsByNames: async (names: string[]) =>
    names.map((name) => [`tag-${name.toLowerCase()}`]),
}));

type KeyGenerators = Record<
  | 'generateBasicKey'
  | 'generateUserKey'
  | 'generateSearchKey'
  | 'generateCountKey',
  (params: ArticleQueryParams) => string
>;

const defaultParams: ArticleCacheParams = {
  page: 1,
  limit: 20,
  sortBy: 'publishedAt',
  sortOrder: 'desc',
  sources: 'all',
  includeRelations: false,
  includeEmptyContent: false,
  excludeUnprocessed: false,
  excludeLowQuality: false,
  lightweight: false,
  includeUserData: false,
};

const displayDefaults: DisplayOptions = defaultParams;

describe('LayeredCache cache key generation', () => {
  const cache = Object.create(LayeredCache.prototype) as KeyGenerators;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should include sortOrder in basic cache keys', () => {
    const ascKey = cache.generateBasicKey({
      sortBy: 'publishedAt',
      sortOrder: 'asc',
    });
    const descKey = cache.generateBasicKey({
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    });
    const defaultKey = cache.generateBasicKey({ sortBy: 'publishedAt' });

    expect(ascKey).not.toBe(descKey);
    expect(ascKey).toContain('sortOrder:asc');
    expect(descKey).toContain('sortOrder:desc');
    expect(defaultKey).toBe(descKey);
  });

  it('should include sortOrder in user cache keys', () => {
    const ascKey = cache.generateUserKey({
      userId: 'user-1',
      readFilter: 'read',
      sortBy: 'publishedAt',
      sortOrder: 'asc',
    });
    const descKey = cache.generateUserKey({
      userId: 'user-1',
      readFilter: 'read',
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    });
    const defaultKey = cache.generateUserKey({
      userId: 'user-1',
      readFilter: 'read',
      sortBy: 'publishedAt',
    });

    expect(ascKey).not.toBe(descKey);
    expect(ascKey).toContain('sortOrder:asc');
    expect(descKey).toContain('sortOrder:desc');
    expect(defaultKey).toBe(descKey);
  });

  it('should include sortBy in count cache keys', () => {
    const publishedAtKey = cache.generateCountKey({ sortBy: 'publishedAt' });
    const createdAtKey = cache.generateCountKey({ sortBy: 'createdAt' });
    const defaultKey = cache.generateCountKey({});

    expect(publishedAtKey).not.toBe(createdAtKey);
    expect(publishedAtKey).toContain('sortBy:publishedAt');
    expect(createdAtKey).toContain('sortBy:createdAt');
    expect(defaultKey).toBe(publishedAtKey);
  });

  it('should include sortOrder in search cache keys', () => {
    const ascKey = cache.generateSearchKey({
      search: 'foo bar',
      sortBy: 'publishedAt',
      sortOrder: 'asc',
    });
    const descKey = cache.generateSearchKey({
      search: 'foo bar',
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    });
    const defaultKey = cache.generateSearchKey({
      search: 'foo bar',
      sortBy: 'publishedAt',
    });

    expect(ascKey).not.toBe(descKey);
    expect(ascKey).toContain('sortOrder:asc');
    expect(descKey).toContain('sortOrder:desc');
    expect(defaultKey).toBe(descKey);
  });

  describe.each([
    ['L1', 'generateBasicKey', {}],
    ['L2', 'generateUserKey', { userId: 'user-1', readFilter: 'read' }],
    ['L3', 'generateSearchKey', { search: 'React' }],
  ] as const)('%s selection keys', (_layer, method, context) => {
    it.each([
      ['lightweight', { lightweight: true }],
      ['fields', { fields: 'title,summary' }],
      ['includeRelations', { includeRelations: true }],
    ] as const)(
      'separates queries when %s changes the selected columns',
      (_name, change) => {
        const before = { ...displayDefaults };
        const after = { ...before, ...change };

        expect(buildSelectFields(before)).not.toEqual(buildSelectFields(after));
        expect(cache[method]({ ...before, ...context })).not.toBe(
          cache[method]({ ...after, ...context })
        );
      }
    );

    it('treats omitted flags and explicit false as the same query', () => {
      expect(cache[method](context)).toBe(
        cache[method]({
          ...context,
          lightweight: false,
          fields: '',
          includeRelations: false,
          includeEmptyContent: false,
          excludeUnprocessed: false,
          excludeLowQuality: false,
        })
      );
    });

    it('keeps an invalid custom field list distinct from the default selection', () => {
      expect(buildSelectFields({ ...displayDefaults, fields: 'all' })).toEqual({
        id: true,
      });
      expect(cache[method]({ ...context, fields: 'all' })).not.toBe(
        cache[method](context)
      );
    });
  });

  // 実際の WHERE が変わる入力とキーを照合する。件数キーは API の変換処理も通す。
  const whereCases: [
    string,
    Partial<ArticleCacheParams>,
    Partial<ArticleCacheParams>,
  ][] = [
    ['sources', {}, { sources: 'qiita' }],
    ['sourceId', { sources: '' }, { sourceId: 'qiita' }],
    ['excludeSources', {}, { excludeSources: 'qiita' }],
    ['tag', {}, { tag: 'React' }],
    ['tags', {}, { tags: 'React,Vue' }],
    ['tagMode', { tags: 'React,Vue', tagMode: 'OR' }, { tagMode: 'AND' }],
    ['category', {}, { category: 'uncategorized' }],
    ['dateRange', {}, { dateRange: 'week' }],
    ['dateFrom', {}, { dateFrom: '2026-01-01' }],
    ['dateTo', {}, { dateTo: '2026-02-01' }],
    ['sortBy', { dateFrom: '2026-01-01' }, { sortBy: 'createdAt' }],
    ['includeEmptyContent', {}, { includeEmptyContent: true }],
    ['excludeUnprocessed', {}, { excludeUnprocessed: true }],
    ['excludeLowQuality', {}, { excludeLowQuality: true }],
  ];

  async function actualWhere(params: ArticleCacheParams) {
    return buildWhereClause(
      params,
      params,
      params.userId,
      new MetricsCollector(),
      params.sortBy
    );
  }

  describe.each([
    ['L1', 'generateBasicKey', {}],
    ['L2', 'generateUserKey', { userId: 'user-1', readFilter: 'read' }],
    ['L3', 'generateSearchKey', { search: 'React' }],
    ['count', 'generateCountKey', {}],
  ] as const)('%s filter keys', (_layer, method, context) => {
    it.each(whereCases)(
      'separates queries when %s changes the WHERE clause',
      async (_name, base, change) => {
        const before = { ...defaultParams, ...context, ...base };
        const after = { ...before, ...change };

        expect(await actualWhere(before)).not.toEqual(await actualWhere(after));
        const keyParams = (params: ArticleCacheParams) =>
          method === 'generateCountKey' ? toArticleQueryParams(params) : params;
        expect(cache[method](keyParams(before))).not.toBe(
          cache[method](keyParams(after))
        );
      }
    );
  });

  it('includes search in both search and count keys when the WHERE changes', async () => {
    const before = { ...defaultParams, search: 'React' };
    const after = { ...before, search: 'Vue' };
    expect(await actualWhere(before)).not.toEqual(await actualWhere(after));
    expect(cache.generateSearchKey(before)).not.toBe(
      cache.generateSearchKey(after)
    );
    expect(cache.generateCountKey(toArticleQueryParams(before))).not.toBe(
      cache.generateCountKey(toArticleQueryParams(after))
    );
  });

  it('shares counts across pagination, sort direction and selected columns', () => {
    const changed = {
      ...defaultParams,
      page: 3,
      limit: 50,
      sortOrder: 'asc' as const,
      lightweight: true,
      fields: 'title',
      includeRelations: true,
    };
    expect(cache.generateCountKey(defaultParams)).toBe(
      cache.generateCountKey(changed)
    );
    expect(cache.generateCountKey(toArticleQueryParams(defaultParams))).toBe(
      cache.generateCountKey(toArticleQueryParams(changed))
    );
  });
});
