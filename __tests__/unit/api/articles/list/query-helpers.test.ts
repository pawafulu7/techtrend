/**
 * query-helpers のユニットテスト
 *
 * M-1: source ID の trim テスト
 * - normalizeSourcesForCacheKey: スペース付きソースIDが正しくtrimされること
 * - buildWhereClause: スペース付きsources値でソースフィルタが正しく適用されること
 */

// prismaモジュールのモック（buildWhereClause内でのcountCacheアクセスを回避）
jest.mock('@/lib/prisma', () => ({
  prisma: {
    article: {
      count: jest.fn().mockResolvedValue(0),
    },
  },
}));

// countCacheのモック（cache-configのRedis依存を回避）
jest.mock('@/app/api/articles/list/cache-config', () => ({
  countCache: {
    generateCacheKey: jest.fn().mockReturnValue('test-cache-key'),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  },
}));

// date-utilsのモック
jest.mock('@/app/lib/date-utils', () => ({
  getDateRangeFilter: jest.fn().mockReturnValue(null),
  parseDateFromTo: jest.fn().mockReturnValue(null),
  getDateFieldForSort: jest.fn().mockReturnValue('publishedAt'),
}));

// loggerのモック
jest.mock('@/lib/logger', () => ({
  default: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// article-category-normalizerのモック
jest.mock('@/lib/utils/article/article-category-normalizer', () => ({
  normalizeArticleCategory: jest.fn((c: string) => c),
}));

import {
  normalizeSearchForCacheKey,
  normalizeSourcesForCacheKey,
  buildWhereClause,
} from '@/app/api/articles/list/query-helpers';
import type { WhereClauseParams } from '@/app/api/articles/list/query-helpers';

/** デフォルトのWhereClauseParamsスタブ */
function makeDefaultParams(overrides: Partial<WhereClauseParams> = {}): WhereClauseParams {
  return {
    sources: null,
    sourceId: null,
    excludeSources: null,
    tag: null,
    tags: null,
    tagMode: 'OR',
    tagIdGroups: [],
    search: null,
    dateRange: null,
    dateFrom: null,
    dateTo: null,
    readFilter: null,
    userId: undefined,
    category: null,
    excludeUnprocessed: false,
    excludeLowQuality: false,
    includeOffTopic: false,
    finalSortBy: 'publishedAt',
    ...overrides,
  };
}

describe('query-helpers', () => {
  describe('normalizeSourcesForCacheKey', () => {
    it('should trim spaces from individual source IDs', () => {
      const result = normalizeSourcesForCacheKey(' id1 , id2 ', null);
      // スペースがtrimされてソートされた形になる
      expect(result).toBe('id1,id2');
    });

    it('should handle leading and trailing spaces in source string', () => {
      const result = normalizeSourcesForCacheKey('  source-a  ', null);
      expect(result).toBe('source-a');
    });

    it('should sort source IDs for consistent cache key', () => {
      const result = normalizeSourcesForCacheKey('z-source , a-source , m-source', null);
      expect(result).toBe('a-source,m-source,z-source');
    });

    it('should return "all" when sources is "all" (case insensitive, trimmed)', () => {
      expect(normalizeSourcesForCacheKey('all', null)).toBe('all');
      expect(normalizeSourcesForCacheKey(' ALL ', null)).toBe('all');
      expect(normalizeSourcesForCacheKey(' All ', null)).toBe('all');
    });

    it('should return "none" when sources is "none" (case insensitive, trimmed)', () => {
      expect(normalizeSourcesForCacheKey('none', null)).toBe('none');
      expect(normalizeSourcesForCacheKey(' NONE ', null)).toBe('none');
    });

    it('should use sourceId when sources is null', () => {
      expect(normalizeSourcesForCacheKey(null, 'source-123')).toBe('source-123');
    });

    it('should return "all" when both sources and sourceId are null', () => {
      expect(normalizeSourcesForCacheKey(null, null)).toBe('all');
    });

    it('should filter out empty segments after trimming', () => {
      // カンマのみや空のセグメントはフィルタされる
      const result = normalizeSourcesForCacheKey('id1,,id2, ,id3', null);
      expect(result).toBe('id1,id2,id3');
    });
  });

  describe('buildWhereClause', () => {
    it('技術者向けでない記事を既定で外す（issue #722）', () => {
      const where = buildWhereClause(makeDefaultParams());
      expect(where.AND).toContainEqual({ isOffTopic: false });
    });

    it('includeOffTopic が true なら技術者向けでない記事も含める', () => {
      const where = buildWhereClause(
        makeDefaultParams({ includeOffTopic: true })
      );
      expect(where.AND).not.toContainEqual({ isOffTopic: false });
    });

    it('should trim spaces from source IDs in sources parameter', () => {
      const params = makeDefaultParams({
        sources: ' id1 , id2 ',
      });
      const where = buildWhereClause(params);

      // trimされたIDでIN条件が組み立てられている
      expect(where.sourceId).toEqual({ in: ['id1', 'id2'] });
    });

    it('should handle single source ID with surrounding spaces', () => {
      const params = makeDefaultParams({
        sources: '  source-abc  ',
      });
      const where = buildWhereClause(params);

      expect(where.sourceId).toEqual({ in: ['source-abc'] });
    });

    it('should handle mixed whitespace in sources parameter', () => {
      const params = makeDefaultParams({
        sources: ' src-1 , src-2 , src-3 ',
      });
      const where = buildWhereClause(params);

      expect(where.sourceId).toEqual({ in: ['src-1', 'src-2', 'src-3'] });
    });

    it('should set sourceId in:[] when sources is "none"', () => {
      const params = makeDefaultParams({
        sources: 'none',
      });
      const where = buildWhereClause(params);

      expect(where.sourceId).toEqual({ in: [] });
    });

    it('should not set sourceId filter when sources is "all"', () => {
      const params = makeDefaultParams({
        sources: 'all',
      });
      const where = buildWhereClause(params);

      // "all" の場合はsourceIdフィルタを設定しない
      // ただし無効化したソースを除く条件は AND に入る（issue #688）
      expect(where.sourceId).toBeUndefined();
      expect(where.AND).toContainEqual({ source: { is: { enabled: true } } });
    });

    it('should not set sourceId filter when sources and sourceId are both null', () => {
      const params = makeDefaultParams({
        sources: null,
        sourceId: null,
      });
      const where = buildWhereClause(params);

      expect(where.sourceId).toBeUndefined();
    });

    it('should filter out empty segments after trimming in sources', () => {
      const params = makeDefaultParams({
        sources: 'id1,,id2, ,id3',
      });
      const where = buildWhereClause(params);

      expect(where.sourceId).toEqual({ in: ['id1', 'id2', 'id3'] });
    });

    it('should always exclude articles from disabled sources', () => {
      const params = makeDefaultParams();
      const where = buildWhereClause(params);

      // ソースの指定（sourceId）とぶつからないよう AND に入れる（issue #688）
      expect(where.AND).toContainEqual({ source: { is: { enabled: true } } });
    });

    it('does not filter by tag when no tag IDs are given', () => {
      const where = buildWhereClause(makeDefaultParams({ tag: 'React' }));

      // タグ名は route が resolveTagIdGroups で ID にして渡す。名前だけでは絞らない
      expect(where.tags).toBeUndefined();
    });

    it('filters by any of the resolved tag IDs in OR mode', () => {
      const where = buildWhereClause(
        makeDefaultParams({
          tags: 'React,Vue',
          tagIdGroups: [['tag-react'], ['tag-vue']],
        })
      );

      expect(where.tags).toEqual({
        some: { id: { in: ['tag-react', 'tag-vue'] } },
      });
    });

    it('requires every resolved tag in AND mode', () => {
      const where = buildWhereClause(
        makeDefaultParams({
          tags: 'React,Vue',
          tagMode: 'AND',
          tagIdGroups: [['tag-react'], ['tag-vue']],
        })
      );

      expect(where.tags).toBeUndefined();
      expect(where.AND).toEqual(
        expect.arrayContaining([
          { tags: { some: { id: { in: ['tag-react'] } } } },
          { tags: { some: { id: { in: ['tag-vue'] } } } },
        ])
      );
    });
  });
});

describe('normalizeSearchForCacheKey', () => {
  it('splits and sorts keywords into a JSON array', () => {
    expect(normalizeSearchForCacheKey(' React\u3000Hooks  AI ')).toBe(
      'v2:["AI","Hooks","React"]'
    );
    expect(normalizeSearchForCacheKey(null)).toBe('none');
    expect(normalizeSearchForCacheKey('   ')).toBe('none');
  });

  it('keeps keyword boundaries and does not collide with "none" (#684)', () => {
    // 区切り文字で連結すると "a,b c" と "a b,c" が同じキーになっていた
    expect(normalizeSearchForCacheKey('a,b c')).not.toBe(
      normalizeSearchForCacheKey('a b,c')
    );
    expect(normalizeSearchForCacheKey('none')).not.toBe(
      normalizeSearchForCacheKey(null)
    );
  });

  it('uses only the keywords used in the query (first 10) (#684)', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `w${i}`).join(' ');
    const ten = Array.from({ length: 10 }, (_, i) => `w${i}`).join(' ');
    expect(normalizeSearchForCacheKey(eleven)).toBe(
      normalizeSearchForCacheKey(ten)
    );
  });
});
