import {
  parseChangelog,
  classifyEntry,
  versionToSortOrder,
  CLASSIFICATION_RULES,
  ChangelogCategory,
  ParsedVersion,
} from '@/lib/changelog/parser';

// ---------------------------------------------------------------------------
// classifyEntry
// ---------------------------------------------------------------------------

describe('classifyEntry', () => {
  describe('FEATURE verbs', () => {
    it.each([
      'Added new dark mode',
      'Add support for streaming',
      'Adds keyboard shortcuts',
      'Introduced tab completion',
      'Introduces new API',
      'Released v2 of CLI',
      'New onboarding flow',
      'Support for ARM64',
      'Supported custom themes',
      'Supports multi-window',
      'Allow custom keybindings',
      'Allowed inline editing',
      'Allows drag and drop',
    ])('classifies "%s" as FEATURE', (content) => {
      expect(classifyEntry(content)).toBe('FEATURE');
    });
  });

  describe('BUGFIX verbs', () => {
    it.each([
      'Fixed crash on startup',
      'Fix memory leak in parser',
      'Fixes rendering issue',
      'Resolved race condition',
      'Resolves timeout error',
      'Reverted breaking change',
      'Reverts accidental removal',
    ])('classifies "%s" as BUGFIX', (content) => {
      expect(classifyEntry(content)).toBe('BUGFIX');
    });
  });

  describe('IMPROVEMENT verbs', () => {
    it.each([
      'Improved performance of search',
      'Improves startup time',
      'Enhanced error messages',
      'Enhances UX for mobile',
      'Optimized bundle size',
      'Optimizes database queries',
      'Updated dependencies',
      'Updates React to v19',
      'Upgraded Node to v22',
      'Upgrades Prisma ORM',
      'Increased timeout to 30s',
      'Increases buffer size',
      'Reduced memory footprint',
      'Reduces cold start time',
      'Expanded locale support',
      'Expands search scope',
      'Deprecated old API endpoint',
      'Deprecates v1 routes',
      'Changed default theme',
      'Changes logging format',
      'Removed legacy code',
      'Removes unused imports',
      'Set default timeout to 5s',
      'Use new rendering engine',
    ])('classifies "%s" as IMPROVEMENT', (content) => {
      expect(classifyEntry(content)).toBe('IMPROVEMENT');
    });
  });

  describe('OTHER (no matching verb)', () => {
    it.each([
      'Bump version to 3.0.0',
      'Internal refactoring',
      'Miscellaneous changes',
      'Better error handling',
      'Documentation updates',
    ])('classifies "%s" as OTHER', (content) => {
      expect(classifyEntry(content)).toBe('OTHER');
    });
  });

  it('is case-insensitive', () => {
    expect(classifyEntry('ADDED new feature')).toBe('FEATURE');
    expect(classifyEntry('fixed a bug')).toBe('BUGFIX');
    expect(classifyEntry('IMPROVED performance')).toBe('IMPROVEMENT');
  });

  it('trims whitespace before matching', () => {
    expect(classifyEntry('  Added something')).toBe('FEATURE');
    expect(classifyEntry('\tFixed a crash')).toBe('BUGFIX');
  });
});

// ---------------------------------------------------------------------------
// versionToSortOrder
// ---------------------------------------------------------------------------

describe('versionToSortOrder', () => {
  it('converts 2.1.63 correctly', () => {
    // 2 * 1_000_000_000 + 1 * 1_000_000 + 63 * 10 + 1 (not prerelease)
    expect(versionToSortOrder('2.1.63')).toBe(2_001_000_631);
  });

  it('converts 0.0.1 correctly', () => {
    // 0 + 0 + 1 * 10 + 1 = 11
    expect(versionToSortOrder('0.0.1')).toBe(11);
  });

  it('converts 10.20.30 correctly', () => {
    // 10 * 1_000_000_000 + 20 * 1_000_000 + 30 * 10 + 1
    expect(versionToSortOrder('10.20.30')).toBe(10_020_000_301);
  });

  it('handles major.minor only (no patch)', () => {
    // 2 * 1_000_000_000 + 1 * 1_000_000 + 0 + 1
    expect(versionToSortOrder('2.1')).toBe(2_001_000_001);
  });

  it('ensures higher versions produce higher sortOrder', () => {
    const ordered = ['0.0.1', '0.1.0', '1.0.0', '2.1.63', '10.20.30'];
    const sortOrders = ordered.map(versionToSortOrder);
    for (let i = 1; i < sortOrders.length; i++) {
      expect(sortOrders[i]).toBeGreaterThan(sortOrders[i - 1]);
    }
  });

  it('handles single number gracefully', () => {
    // 5 * 1_000_000_000 + 0 + 0 + 1
    expect(versionToSortOrder('5')).toBe(5_000_000_001);
  });

  it('handles prerelease versions', () => {
    // プレリリースは同一数値版より前に並ぶ
    expect(versionToSortOrder('1.2.3-beta.1')).toBeLessThan(
      versionToSortOrder('1.2.3')
    );
    // 1 * 1_000_000_000 + 2 * 1_000_000 + 3 * 10 + 0 (prerelease)
    expect(versionToSortOrder('1.2.3-beta.1')).toBe(1_002_000_030);
    // 1 * 1_000_000_000 + 2 * 1_000_000 + 3 * 10 + 1 (not prerelease)
    expect(versionToSortOrder('1.2.3')).toBe(1_002_000_031);
  });

  it('ignores build metadata (treats 1.2.3+build-1 same as 1.2.3+build.2)', () => {
    expect(versionToSortOrder('1.2.3+build-1')).toBe(
      versionToSortOrder('1.2.3+build.2')
    );
  });

  it('build metadata version is greater than prerelease version', () => {
    // 1.2.3+build-1 is a release (not prerelease), 1.2.3-beta+build is prerelease
    expect(versionToSortOrder('1.2.3+build-1')).toBeGreaterThan(
      versionToSortOrder('1.2.3-beta+build')
    );
  });
});

// ---------------------------------------------------------------------------
// parseChangelog
// ---------------------------------------------------------------------------

describe('parseChangelog', () => {
  it('parses multiple versions with entries', () => {
    const md = [
      '## 2.1.63',
      '',
      '- Added dark mode support',
      '- Fixed crash on startup',
      '',
      '## 2.1.62',
      '',
      '- Improved search performance',
      '- Bump dependencies',
    ].join('\n');

    const result = parseChangelog(md);

    expect(result.versions).toHaveLength(2);

    const v63 = result.versions[0];
    expect(v63.version).toBe('2.1.63');
    expect(v63.sortOrder).toBe(2_001_000_631);
    expect(v63.entries).toHaveLength(2);
    expect(v63.entries[0]).toEqual({
      content: 'Added dark mode support',
      category: 'FEATURE',
      orderIndex: 0,
    });
    expect(v63.entries[1]).toEqual({
      content: 'Fixed crash on startup',
      category: 'BUGFIX',
      orderIndex: 1,
    });

    const v62 = result.versions[1];
    expect(v62.version).toBe('2.1.62');
    expect(v62.entries).toHaveLength(2);
    expect(v62.entries[0].category).toBe('IMPROVEMENT');
    expect(v62.entries[1].category).toBe('OTHER');
  });

  it('returns empty versions array for empty input', () => {
    const result = parseChangelog('');
    expect(result.versions).toEqual([]);
  });

  it('includes versions with no entries (empty entries array)', () => {
    const md = ['## 3.0.0', '', '## 2.0.0', '- Added something'].join('\n');

    const result = parseChangelog(md);
    expect(result.versions).toHaveLength(2);
    expect(result.versions[0].version).toBe('3.0.0');
    expect(result.versions[0].entries).toEqual([]);
    expect(result.versions[1].entries).toHaveLength(1);
  });

  it('handles version headers only (no entries at all)', () => {
    const md = ['## 3.0.0', '', '## 2.0.0', '', '## 1.0.0'].join('\n');

    const result = parseChangelog(md);
    expect(result.versions).toHaveLength(3);
    for (const v of result.versions) {
      expect(v.entries).toEqual([]);
    }
  });

  it('ignores lines that are not entries or version headers', () => {
    const md = [
      '# Changelog',
      '',
      'Some introductory text.',
      '',
      '## 1.0.0',
      '',
      'This is a description paragraph, not an entry.',
      '- Added feature A',
      '  continuation line (not a new entry)',
      '- Fixed bug B',
    ].join('\n');

    const result = parseChangelog(md);
    expect(result.versions).toHaveLength(1);
    expect(result.versions[0].entries).toHaveLength(2);
    expect(result.versions[0].entries[0].content).toBe('Added feature A');
    expect(result.versions[0].entries[1].content).toBe('Fixed bug B');
  });

  it('handles entries before any version header (ignores them)', () => {
    const md = ['- Orphan entry', '', '## 1.0.0', '- Added X'].join('\n');

    const result = parseChangelog(md);
    expect(result.versions).toHaveLength(1);
    expect(result.versions[0].entries).toHaveLength(1);
    expect(result.versions[0].entries[0].content).toBe('Added X');
  });

  it('is resilient to extra text after version number in header', () => {
    const md = ['## 2.0.0 (2026-03-01)', '- Added something new'].join('\n');

    const result = parseChangelog(md);
    expect(result.versions).toHaveLength(1);
    expect(result.versions[0].version).toBe('2.0.0');
    expect(result.versions[0].entries).toHaveLength(1);
  });

  it('parses prerelease version headers', () => {
    const md = ['## 1.2.3-beta.1', '- Added experimental feature'].join('\n');

    const result = parseChangelog(md);
    expect(result.versions).toHaveLength(1);
    expect(result.versions[0].version).toBe('1.2.3-beta.1');
  });

  it('parses version headers with v prefix', () => {
    const md = ['## v2.0.0', '- Added something new'].join('\n');

    const result = parseChangelog(md);
    expect(result.versions).toHaveLength(1);
    expect(result.versions[0].version).toBe('2.0.0');
  });

  it('parses version headers with square brackets (e.g. ## [1.2.3])', () => {
    const md = [
      '## [1.2.3]',
      '- Added feature X',
      '## [v0.9.0]',
      '- Initial release',
    ].join('\n');

    const result = parseChangelog(md);
    expect(result.versions).toHaveLength(2);
    expect(result.versions[0].version).toBe('1.2.3');
    expect(result.versions[0].entries).toHaveLength(1);
    expect(result.versions[1].version).toBe('0.9.0');
    expect(result.versions[1].entries).toHaveLength(1);
  });

  it('assigns sequential orderIndex per version', () => {
    const md = [
      '## 1.0.0',
      '- Added A',
      '- Fixed B',
      '- Improved C',
      '- Something else',
    ].join('\n');

    const result = parseChangelog(md);
    const indices = result.versions[0].entries.map((e) => e.orderIndex);
    expect(indices).toEqual([0, 1, 2, 3]);
  });

  it('resets orderIndex for each version', () => {
    const md = [
      '## 2.0.0',
      '- Added A',
      '- Fixed B',
      '## 1.0.0',
      '- Improved C',
    ].join('\n');

    const result = parseChangelog(md);
    expect(result.versions[0].entries[0].orderIndex).toBe(0);
    expect(result.versions[0].entries[1].orderIndex).toBe(1);
    expect(result.versions[1].entries[0].orderIndex).toBe(0);
  });

  it('parses prerelease version headers containing hyphen in identifier', () => {
    const md = ['## 1.2.3-beta-1', '- Added experimental feature'].join('\n');
    const result = parseChangelog(md);
    expect(result.versions).toHaveLength(1);
    expect(result.versions[0].version).toBe('1.2.3-beta-1');
  });

  it('parses "*" bullet entries', () => {
    const md = ['## 1.0.0', '* Added A', '* Fixed B'].join('\n');
    const result = parseChangelog(md);
    expect(result.versions[0].entries).toHaveLength(2);
    expect(result.versions[0].entries[0].content).toBe('Added A');
    expect(result.versions[0].entries[1].content).toBe('Fixed B');
  });
});

// ---------------------------------------------------------------------------
// CLASSIFICATION_RULES constant
// ---------------------------------------------------------------------------

describe('CLASSIFICATION_RULES', () => {
  it('is a non-empty readonly array', () => {
    expect(CLASSIFICATION_RULES.length).toBeGreaterThanOrEqual(3);
  });

  it('covers FEATURE, BUGFIX, and IMPROVEMENT categories', () => {
    const categories = CLASSIFICATION_RULES.map((r) => r.category);
    expect(categories).toContain('FEATURE');
    expect(categories).toContain('BUGFIX');
    expect(categories).toContain('IMPROVEMENT');
  });
});
