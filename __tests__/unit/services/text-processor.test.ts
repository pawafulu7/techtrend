/**
 * テキスト処理ユーティリティのテスト
 */

import {
  cleanupText,
  finalCleanup,
  normalizeDetailedSummary,
  stripHtmlTags,
  truncateText
} from '@/lib/services/summary-generation/text-processor';

describe('text-processor', () => {
  describe('cleanupText', () => {
    it('should remove excessive line breaks', () => {
      const input = 'Line1\n\n\n\nLine2';
      const result = cleanupText(input);
      expect(result).toBe('Line1\n\nLine2');
    });

    it('should normalize spaces', () => {
      const input = 'Word1     Word2';
      const result = cleanupText(input);
      expect(result).toBe('Word1  Word2');
    });

    it('should normalize punctuation', () => {
      const input = '項目１：内容（詳細）';
      const result = cleanupText(input);
      expect(result).toBe('項目１:内容(詳細)');
    });

    it('should handle empty input', () => {
      expect(cleanupText('')).toBe('');
      expect(cleanupText(null as any)).toBe('');
      expect(cleanupText(undefined as any)).toBe('');
    });

    it('should remove duplicate periods', () => {
      const input = '文章です。。。';
      const result = cleanupText(input);
      expect(result).toBe('文章です。');
    });
  });

  describe('finalCleanup', () => {
    it('should add period at the end if missing', () => {
      const input = 'これはテスト文章です';
      const result = finalCleanup(input);
      expect(result).toBe('これはテスト文章です。');
    });

    it('should not add period if already present', () => {
      const input = 'これはテスト文章です。';
      const result = finalCleanup(input);
      expect(result).toBe('これはテスト文章です。');
    });

    it('should apply cleanup before adding period', () => {
      const input = 'テスト   文章';
      const result = finalCleanup(input);
      expect(result).toBe('テスト  文章。');
    });
  });

  describe('normalizeDetailedSummary', () => {
    it('should normalize bullet points', () => {
      const input = '- Item1\n• Item2\n* Item3';
      const result = normalizeDetailedSummary(input);
      expect(result).toBe('・Item1\n・Item2\n・Item3');
    });

    it('should normalize numbered lists', () => {
      const input = '1. First\n2) Second';
      const result = normalizeDetailedSummary(input);
      expect(result).toBe('1. First\n2. Second');
    });

    it('should remove empty lines', () => {
      const input = 'Line1\n\n\nLine2\n\n';
      const result = normalizeDetailedSummary(input);
      expect(result).toBe('Line1\nLine2');
    });

    it('should trim each line', () => {
      const input = '  Line1  \n  Line2  ';
      const result = normalizeDetailedSummary(input);
      expect(result).toBe('Line1\nLine2');
    });
  });

  describe('stripHtmlTags', () => {
    it('should remove HTML tags', () => {
      const input = '<p>Hello <strong>World</strong></p>';
      const result = stripHtmlTags(input);
      expect(result).toBe('Hello World');
    });

    it('should decode HTML entities', () => {
      const input = '&lt;code&gt; &amp; &quot;text&quot;';
      const result = stripHtmlTags(input);
      expect(result).toBe('<code> & "text"');
    });

    it('should handle nbsp', () => {
      const input = 'Word1&nbsp;Word2';
      const result = stripHtmlTags(input);
      expect(result).toBe('Word1 Word2');
    });

    it('should handle empty input', () => {
      expect(stripHtmlTags('')).toBe('');
      expect(stripHtmlTags(null as any)).toBe('');
    });
  });

  describe('truncateText', () => {
    it('should truncate long text', () => {
      const input = 'これは非常に長いテキストです。途中で切る必要があります。';
      const result = truncateText(input, 20);
      expect(result.length).toBeLessThanOrEqual(20);
      expect(result).toContain('...');
    });

    it('should not truncate short text', () => {
      const input = '短いテキスト';
      const result = truncateText(input, 100);
      expect(result).toBe(input);
    });

    it('should use custom suffix', () => {
      const input = '長いテキストをカット';
      const result = truncateText(input, 10, '…');
      expect(result).toContain('…');
    });

    it('should try to cut at sentence boundary', () => {
      const input = 'これは文章です。次の文章。';
      const result = truncateText(input, 15);
      expect(result).toBe('これは文章です。...');
    });

    it('should handle empty input', () => {
      expect(truncateText('', 10)).toBe('');
      expect(truncateText(null as any, 10)).toBe(null);
    });
  });
});