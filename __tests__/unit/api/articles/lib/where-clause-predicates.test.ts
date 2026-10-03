/**
 * where-clause-predicates のタグ絞り込み（#681）
 *
 * タグ名は lower(name) で ID にしてから絞る。Prisma の mode: 'insensitive'（ILIKE）は
 * `_` と `%` がワイルドカードとして効くため使わない。
 */
import type { Prisma } from '@/lib/prisma-exports';

const findTagIdGroupsByNames = jest.fn();
jest.mock('@/lib/services/tag-service', () => ({
  findTagIdGroupsByNames: (...args: unknown[]) =>
    findTagIdGroupsByNames(...args),
}));

import {
  MAX_TAG_FILTER_COUNT,
  MAX_TAG_NAME_LENGTH,
  parseTagList,
  pushSearchFilter,
  capSearchKeywords,
  pushTagFilter,
  resolveTagIdGroups,
  splitSearchKeywords,
  validateSearchQuery,
  validateTagFilter,
} from '@/app/api/articles/lib/where-clause-predicates';

describe('parseTagList', () => {
  it('prefers tag over tags', () => {
    expect(parseTagList('React', 'Vue,Go')).toEqual(['React']);
  });

  it('splits tags on commas and drops empty items', () => {
    expect(parseTagList(null, ' React , , Vue ,')).toEqual(['React', 'Vue']);
  });

  it('returns an empty list when neither is given', () => {
    expect(parseTagList(undefined, '')).toEqual([]);
  });
});

describe('resolveTagIdGroups', () => {
  beforeEach(() => {
    findTagIdGroupsByNames.mockReset();
  });

  it('does not query when there is no tag filter', async () => {
    await expect(resolveTagIdGroups(null, null)).resolves.toEqual([]);
    expect(findTagIdGroupsByNames).not.toHaveBeenCalled();
  });

  it('resolves the parsed tag names', async () => {
    findTagIdGroupsByNames.mockResolvedValue([['id-a'], []]);

    await expect(
      resolveTagIdGroups(null, 'Claude_Code, 100%')
    ).resolves.toEqual([['id-a'], []]);
    expect(findTagIdGroupsByNames).toHaveBeenCalledWith([
      'Claude_Code',
      '100%',
    ]);
  });
});

describe('pushTagFilter', () => {
  function apply(tagIdGroups: string[][], tagMode?: string) {
    const where: Prisma.ArticleWhereInput = {};
    const andConditions: Prisma.ArticleWhereInput[] = [];
    pushTagFilter(where, andConditions, tagIdGroups, tagMode);
    return { where, andConditions };
  }

  it('adds nothing without tag ID groups', () => {
    expect(apply([])).toEqual({ where: {}, andConditions: [] });
  });

  it('matches any resolved ID in OR mode, without duplicates', () => {
    expect(apply([['a'], ['b', 'a']]).where).toEqual({
      tags: { some: { id: { in: ['a', 'b'] } } },
    });
  });

  it('matches nothing in OR mode when no name resolved', () => {
    expect(apply([[], []]).where).toEqual({
      tags: { some: { id: { in: [] } } },
    });
  });

  it('requires one of each group in AND mode', () => {
    const { where, andConditions } = apply([['a'], []], 'AND');

    expect(where).toEqual({});
    // 当たらない名前の組は id: { in: [] } になり、結果が 0 件になる
    expect(andConditions).toEqual([
      { tags: { some: { id: { in: ['a'] } } } },
      { tags: { some: { id: { in: [] } } } },
    ]);
  });

  it('never uses name matching (ILIKE)', () => {
    const { where, andConditions } = apply([['a']], 'OR');
    expect(JSON.stringify({ where, andConditions })).not.toContain(
      'insensitive'
    );
  });
});

describe('validateTagFilter', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => `t${i}`).join(',');

  it('accepts no filter and filters within the limits', () => {
    expect(validateTagFilter(null, null)).toBeNull();
    expect(validateTagFilter('a'.repeat(MAX_TAG_NAME_LENGTH), null)).toBeNull();
    // 空の要素は数えない
    expect(
      validateTagFilter(null, `${many(MAX_TAG_FILTER_COUNT)},,`)
    ).toBeNull();
  });

  it('rejects too many tags', () => {
    expect(validateTagFilter(null, many(MAX_TAG_FILTER_COUNT + 1))).toBe(
      `tags must contain at most ${MAX_TAG_FILTER_COUNT} items`
    );
  });

  it('rejects a too long tag in tag or tags', () => {
    const long = 'a'.repeat(MAX_TAG_NAME_LENGTH + 1);
    const message = `each tag must be at most ${MAX_TAG_NAME_LENGTH} characters`;
    expect(validateTagFilter(long, null)).toBe(message);
    expect(validateTagFilter(null, `React,${long}`)).toBe(message);
  });

  it('validates only the filter that is used (tag wins over tags)', () => {
    expect(
      validateTagFilter('React', many(MAX_TAG_FILTER_COUNT + 1))
    ).toBeNull();
    // 分割前の長さの上限も、使わない tags には掛けない
    const commas = ','.repeat(MAX_TAG_FILTER_COUNT * (MAX_TAG_NAME_LENGTH + 1) + 1);
    expect(validateTagFilter('React', commas)).toBeNull();
  });

  it('rejects a tags string that is too long before splitting', () => {
    const commas = ','.repeat(MAX_TAG_FILTER_COUNT * (MAX_TAG_NAME_LENGTH + 1) + 1);
    expect(validateTagFilter(null, commas)).toMatch(/^tags must be at most \d+ characters$/);
  });
});

describe('pushSearchFilter', () => {
  function apply(search: string | null | undefined) {
    const andConditions: Prisma.ArticleWhereInput[] = [];
    pushSearchFilter(andConditions, search);
    return andConditions;
  }

  it('adds one condition per keyword on title and summary', () => {
    expect(apply('React  Hooks')).toEqual([
      {
        OR: [
          { title: { contains: 'React', mode: 'insensitive' } },
          { summary: { contains: 'React', mode: 'insensitive' } },
        ],
      },
      {
        OR: [
          { title: { contains: 'Hooks', mode: 'insensitive' } },
          { summary: { contains: 'Hooks', mode: 'insensitive' } },
        ],
      },
    ]);
  });

  it('escapes LIKE wildcards so that _ and % match literally (#684)', () => {
    expect(apply('100% a_b C:\\')).toEqual([
      {
        OR: [
          { title: { contains: '100\\%', mode: 'insensitive' } },
          { summary: { contains: '100\\%', mode: 'insensitive' } },
        ],
      },
      {
        OR: [
          { title: { contains: 'a\\_b', mode: 'insensitive' } },
          { summary: { contains: 'a\\_b', mode: 'insensitive' } },
        ],
      },
      {
        OR: [
          { title: { contains: 'C:\\\\', mode: 'insensitive' } },
          { summary: { contains: 'C:\\\\', mode: 'insensitive' } },
        ],
      },
    ]);
  });

  it('adds nothing for empty or blank search', () => {
    expect(apply(undefined)).toEqual([]);
    expect(apply('   ')).toEqual([]);
  });
});

describe('validateSearchQuery', () => {
  it('accepts empty or missing search', () => {
    expect(validateSearchQuery(undefined)).toBeNull();
    expect(validateSearchQuery(null)).toBeNull();
    expect(validateSearchQuery('')).toBeNull();
  });

  it('accepts up to 200 characters and 10 keywords', () => {
    expect(validateSearchQuery('a'.repeat(200))).toBeNull();
    const tenWords = Array.from({ length: 10 }, (_, i) => `w${i}`).join(' ');
    expect(validateSearchQuery(tenWords)).toBeNull();
  });

  it('rejects more than 200 characters (#684)', () => {
    expect(validateSearchQuery('a'.repeat(201))).toMatch(/200 characters/);
  });

  it('measures the length after trimming, in code points', () => {
    expect(validateSearchQuery(`  ${'a'.repeat(200)}  `)).toBeNull();
    // 絵文字は UTF-16 では 2 単位だが 1 文字として数える
    expect(validateSearchQuery('😀'.repeat(200))).toBeNull();
  });

  it('counts keywords split by ASCII and full-width spaces (#684)', () => {
    const elevenWords = Array.from({ length: 11 }, (_, i) => `w${i}`);
    expect(validateSearchQuery(elevenWords.join(' '))).toMatch(/10 keywords/);
    expect(validateSearchQuery(elevenWords.join('\u3000'))).toMatch(
      /10 keywords/
    );
    // 連続する空白は 1 つの区切りとして数える
    expect(validateSearchQuery(elevenWords.slice(0, 10).join('   '))).toBeNull();
  });
});

describe('splitSearchKeywords', () => {
  it('splits by ASCII and full-width whitespace, including tabs', () => {
    expect(splitSearchKeywords(' a\tb\u3000c  d\n')).toEqual(['a', 'b', 'c', 'd']);
    expect(splitSearchKeywords(undefined)).toEqual([]);
    expect(splitSearchKeywords(' \t ')).toEqual([]);
  });
});

describe('capSearchKeywords', () => {
  it('keeps only the first 10 keywords (#684)', () => {
    const words = Array.from({ length: 12 }, (_, i) => `w${i}`);
    expect(capSearchKeywords(words.join(' '))).toEqual(words.slice(0, 10));
  });

  it('keeps only the first 200 characters after trimming (#684)', () => {
    expect(capSearchKeywords(`  ${'a'.repeat(250)}`)).toEqual(['a'.repeat(200)]);
    // 200 文字目で語が切れても、その語は途中まで使う
    expect(capSearchKeywords(`${'a'.repeat(198)} bcd`)).toEqual([
      'a'.repeat(198),
      'b',
    ]);
  });

  it('does not split a surrogate pair at the limit', () => {
    expect(capSearchKeywords('😀'.repeat(201))).toEqual(['😀'.repeat(200)]);
  });
});
