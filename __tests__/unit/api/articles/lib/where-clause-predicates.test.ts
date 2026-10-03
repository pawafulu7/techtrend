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
  parseTagList,
  pushTagFilter,
  resolveTagIdGroups,
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
