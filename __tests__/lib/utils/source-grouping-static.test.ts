import { groupSourcesStatic } from '@/lib/utils/source-grouping-static';

describe('groupSourcesStatic', () => {
  it('should group sources by static SOURCE_CATEGORIES', () => {
    const sources = [
      { id: 'cmdq3nww60000tegxi8ruki95', name: 'Hatena Bookmark' },
      { id: 'cmdq440c90000tewuti7ng0un', name: 'Qiita Popular' },
    ];

    const result = groupSourcesStatic(sources);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].group).toHaveProperty('id');
    expect(result[0].group).toHaveProperty('name');
    expect(result[0].group).toHaveProperty('ordering');
    expect(result[0].sources).toBeInstanceOf(Array);
  });

  it('should filter out empty groups', () => {
    const sources = [
      { id: 'nonexistent', name: 'Nonexistent Source' },
    ];

    const result = groupSourcesStatic(sources);

    // Should not include groups with no matching sources
    expect(result.every(g => g.sources.length > 0)).toBe(true);
  });

  it('should sort groups by ordering', () => {
    const sources = [
      { id: 'cmdq3nww60000tegxi8ruki95', name: 'Hatena Bookmark' },
      { id: 'cmdq440c90000tewuti7ng0un', name: 'Qiita Popular' },
    ];

    const result = groupSourcesStatic(sources);

    // Verify ordering is ascending
    for (let i = 1; i < result.length; i++) {
      expect(result[i].group.ordering).toBeGreaterThanOrEqual(result[i - 1].group.ordering);
    }
  });

  it('should return empty array when no sources match', () => {
    const sources: Array<{ id: string; name: string }> = [];

    const result = groupSourcesStatic(sources);

    expect(result).toEqual([]);
  });
});
