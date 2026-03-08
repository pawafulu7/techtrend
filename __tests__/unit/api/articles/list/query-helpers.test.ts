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
    search: null,
    dateRange: null,
    dateFrom: null,
    dateTo: null,
    readFilter: null,
    userId: undefined,
    category: null,
    excludeUnprocessed: false,
    excludeLowQuality: false,
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
      // ただし source: { enabled: true } は設定される
      expect(where.sourceId).toBeUndefined();
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

    it('should always set source.enabled=true filter', () => {
      const params = makeDefaultParams();
      const where = buildWhereClause(params);

      expect(where.source).toEqual({ enabled: true });
    });
  });
});
