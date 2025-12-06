/**
 * Tag Extractor Utility Tests
 */

import {
  normalizeTag,
  dedupeTags,
  extractTagsFromCategories,
  mergeWithBaseTags,
  extractTagsFromText,
  extractTagsFromRSSItem,
} from '@/lib/utils/tag-extractor';

describe('tag-extractor', () => {
  describe('normalizeTag', () => {
    it('returns null for empty string', () => {
      expect(normalizeTag('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(normalizeTag('   ')).toBeNull();
    });

    it('returns null for null/undefined', () => {
      expect(normalizeTag(null as unknown as string)).toBeNull();
      expect(normalizeTag(undefined as unknown as string)).toBeNull();
    });

    it('trims whitespace', () => {
      expect(normalizeTag('  JavaScript  ')).toBe('JavaScript');
    });

    it('normalizes full-width characters (NFKC)', () => {
      // Full-width 'AI' to half-width
      expect(normalizeTag('\uff21\uff29')).toBe('AI');
    });

    it('collapses multiple whitespace', () => {
      expect(normalizeTag('Machine   Learning')).toBe('Machine Learning');
    });

    it('strips leading # and @ symbols', () => {
      expect(normalizeTag('#JavaScript')).toBe('JavaScript');
      expect(normalizeTag('@TypeScript')).toBe('TypeScript');
      expect(normalizeTag('##Python')).toBe('Python');
    });

    it('preserves original case by default', () => {
      expect(normalizeTag('JavaScript')).toBe('JavaScript');
      expect(normalizeTag('TYPESCRIPT')).toBe('TYPESCRIPT');
    });

    it('lowercases when option is set', () => {
      expect(normalizeTag('JavaScript', { lowercase: true })).toBe('javascript');
    });

    it('returns null for tags shorter than minLength', () => {
      expect(normalizeTag('a')).toBeNull();
      expect(normalizeTag('ab')).toBe('ab');
      expect(normalizeTag('a', { minLength: 1 })).toBe('a');
    });

    it('returns null for tags longer than maxLength', () => {
      const longTag = 'a'.repeat(51);
      expect(normalizeTag(longTag)).toBeNull();
      expect(normalizeTag(longTag, { maxLength: 100 })).toBe(longTag);
    });

    it('handles Japanese characters', () => {
      expect(normalizeTag('  \u4eba\u5de5\u77e5\u80fd  ')).toBe('\u4eba\u5de5\u77e5\u80fd');
      expect(normalizeTag('\u6a5f\u68b0\u5b66\u7fd2')).toBe('\u6a5f\u68b0\u5b66\u7fd2');
      expect(normalizeTag('\u30bb\u30ad\u30e5\u30ea\u30c6\u30a3')).toBe('\u30bb\u30ad\u30e5\u30ea\u30c6\u30a3');
    });
  });

  describe('dedupeTags', () => {
    it('returns empty array for empty input', () => {
      expect(dedupeTags([])).toEqual([]);
    });

    it('removes case-insensitive duplicates', () => {
      expect(dedupeTags(['JavaScript', 'javascript', 'JAVASCRIPT'])).toEqual([
        'JavaScript',
      ]);
    });

    it('preserves first occurrence (first-win)', () => {
      expect(dedupeTags(['React', 'Vue', 'react', 'Angular', 'vue'])).toEqual([
        'React',
        'Vue',
        'Angular',
      ]);
    });

    it('preserves original order', () => {
      expect(dedupeTags(['C', 'B', 'A'])).toEqual(['C', 'B', 'A']);
    });
  });

  describe('extractTagsFromCategories', () => {
    it('returns empty array for undefined', () => {
      expect(extractTagsFromCategories(undefined)).toEqual([]);
    });

    it('returns empty array for null', () => {
      expect(extractTagsFromCategories(null)).toEqual([]);
    });

    it('returns empty array for empty array', () => {
      expect(extractTagsFromCategories([])).toEqual([]);
    });

    it('extracts and normalizes valid tags', () => {
      expect(extractTagsFromCategories(['JavaScript', 'TypeScript'])).toEqual([
        'JavaScript',
        'TypeScript',
      ]);
    });

    it('filters out empty strings', () => {
      expect(extractTagsFromCategories(['JavaScript', '', 'TypeScript'])).toEqual([
        'JavaScript',
        'TypeScript',
      ]);
    });

    it('filters out whitespace-only strings', () => {
      expect(extractTagsFromCategories(['JavaScript', '   ', 'TypeScript'])).toEqual([
        'JavaScript',
        'TypeScript',
      ]);
    });

    it('deduplicates case-insensitively', () => {
      expect(extractTagsFromCategories(['JavaScript', 'javascript'])).toEqual([
        'JavaScript',
      ]);
    });

    it('trims whitespace from categories', () => {
      expect(extractTagsFromCategories(['  JavaScript  ', '  TypeScript  '])).toEqual([
        'JavaScript',
        'TypeScript',
      ]);
    });

    it('applies normalization options', () => {
      expect(
        extractTagsFromCategories(['JavaScript', 'TypeScript'], { lowercase: true })
      ).toEqual(['javascript', 'typescript']);
    });
  });

  describe('mergeWithBaseTags', () => {
    it('returns base tags when extracted is empty', () => {
      expect(mergeWithBaseTags([], ['AI', 'ML'])).toEqual(['AI', 'ML']);
    });

    it('returns extracted tags when base is empty', () => {
      expect(mergeWithBaseTags(['JavaScript', 'React'], [])).toEqual([
        'JavaScript',
        'React',
      ]);
    });

    it('places base tags first', () => {
      expect(mergeWithBaseTags(['React', 'Vue'], ['JavaScript'])).toEqual([
        'JavaScript',
        'React',
        'Vue',
      ]);
    });

    it('deduplicates with base tags taking precedence', () => {
      expect(mergeWithBaseTags(['javascript', 'React'], ['JavaScript'])).toEqual([
        'JavaScript',
        'React',
      ]);
    });

    it('handles complex merge', () => {
      expect(
        mergeWithBaseTags(['AWS', 'Lambda', 'aws'], ['Cloud', 'AWS'])
      ).toEqual(['Cloud', 'AWS', 'Lambda']);
    });
  });

  describe('extractTagsFromText', () => {
    it('returns empty array for empty text', () => {
      expect(extractTagsFromText('', ['JavaScript'])).toEqual([]);
    });

    it('returns empty array for empty keywords', () => {
      expect(extractTagsFromText('JavaScript is great', [])).toEqual([]);
    });

    it('extracts matching keywords', () => {
      expect(
        extractTagsFromText('Learn JavaScript and React today', [
          'JavaScript',
          'React',
          'Vue',
        ])
      ).toEqual(['JavaScript', 'React']);
    });

    it('matches case-insensitively', () => {
      expect(
        extractTagsFromText('javascript is awesome', ['JavaScript'])
      ).toEqual(['JavaScript']);
    });

    it('preserves keyword case in output', () => {
      expect(
        extractTagsFromText('TYPESCRIPT rules', ['TypeScript'])
      ).toEqual(['TypeScript']);
    });

    it('deduplicates results', () => {
      expect(
        extractTagsFromText('javascript javascript javascript', [
          'JavaScript',
          'javascript',
        ])
      ).toEqual(['JavaScript']);
    });
  });

  describe('extractTagsFromRSSItem', () => {
    it('returns empty array for null item', () => {
      expect(extractTagsFromRSSItem(null)).toEqual([]);
    });

    it('returns empty array for undefined item', () => {
      expect(extractTagsFromRSSItem(undefined)).toEqual([]);
    });

    it('returns base tags for null item when provided', () => {
      expect(extractTagsFromRSSItem(null, { baseTags: ['AI'] })).toEqual(['AI']);
    });

    it('extracts from categories', () => {
      expect(
        extractTagsFromRSSItem({
          categories: ['JavaScript', 'TypeScript'],
          title: 'Test',
        })
      ).toEqual(['JavaScript', 'TypeScript']);
    });

    it('includes base tags first', () => {
      expect(
        extractTagsFromRSSItem(
          { categories: ['React'] },
          { baseTags: ['JavaScript'] }
        )
      ).toEqual(['JavaScript', 'React']);
    });

    it('extracts keywords from title', () => {
      expect(
        extractTagsFromRSSItem(
          { title: 'Introduction to Machine Learning' },
          { keywords: ['Machine Learning', 'AI'] }
        )
      ).toEqual(['Machine Learning']);
    });

    it('extracts keywords from content', () => {
      expect(
        extractTagsFromRSSItem(
          { content: 'Deep dive into AWS Lambda' },
          { keywords: ['AWS', 'Lambda', 'EC2'] }
        )
      ).toEqual(['AWS', 'Lambda']);
    });

    it('extracts keywords from contentSnippet', () => {
      expect(
        extractTagsFromRSSItem(
          { contentSnippet: 'Docker and Kubernetes guide' },
          { keywords: ['Docker', 'Kubernetes'] }
        )
      ).toEqual(['Docker', 'Kubernetes']);
    });

    it('combines all sources', () => {
      expect(
        extractTagsFromRSSItem(
          {
            categories: ['Tutorial'],
            title: 'React Tutorial',
            content: 'Learn React and TypeScript',
          },
          {
            baseTags: ['Frontend'],
            keywords: ['React', 'TypeScript', 'Vue'],
          }
        )
      ).toEqual(['Frontend', 'Tutorial', 'React', 'TypeScript']);
    });

    it('respects searchTitle option', () => {
      expect(
        extractTagsFromRSSItem(
          { title: 'React Tutorial' },
          { keywords: ['React'], searchTitle: false }
        )
      ).toEqual([]);
    });

    it('respects searchContent option', () => {
      expect(
        extractTagsFromRSSItem(
          { content: 'React Tutorial' },
          { keywords: ['React'], searchContent: false }
        )
      ).toEqual([]);
    });

    it('deduplicates across all sources', () => {
      expect(
        extractTagsFromRSSItem(
          {
            categories: ['React', 'react'],
            title: 'React Tutorial',
          },
          {
            baseTags: ['REACT'],
            keywords: ['React'],
          }
        )
      ).toEqual(['REACT']);
    });
  });
});
