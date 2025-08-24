import { describe, it, expect } from '@jest/globals';
import { cleanupText, cleanupDetailedSummary } from '@/lib/services/summary-generation/text-processor';

describe('Text Processor Utilities', () => {
  describe('cleanupText', () => {
    it('should remove line breaks', () => {
      const input = 'This is\na text\nwith line breaks';
      const result = cleanupText(input);
      expect(result).toBe('This is a text with line breaks');
    });

    it('should remove excessive spaces', () => {
      const input = 'This   has    excessive     spaces';
      const result = cleanupText(input);
      expect(result).toBe('This has excessive spaces');
    });

    it('should trim whitespace', () => {
      const input = '  Trimmed text  ';
      const result = cleanupText(input);
      expect(result).toBe('Trimmed text');
    });

    it('should handle empty string', () => {
      const result = cleanupText('');
      expect(result).toBe('');
    });

    it('should handle null/undefined gracefully', () => {
      const result = cleanupText(null as any);
      expect(result).toBe('');
    });
  });

  describe('cleanupDetailedSummary', () => {
    it('should preserve line breaks in detailed summary', () => {
      const input = '・Point 1\n・Point 2\n・Point 3';
      const result = cleanupDetailedSummary(input);
      expect(result).toContain('\n');
    });

    it('should trim each line', () => {
      const input = '  ・Point 1  \n  ・Point 2  ';
      const result = cleanupDetailedSummary(input);
      expect(result).toBe('・Point 1\n・Point 2');
    });

    it('should remove empty lines', () => {
      const input = '・Point 1\n\n\n・Point 2';
      const result = cleanupDetailedSummary(input);
      expect(result).toBe('・Point 1\n・Point 2');
    });

    it('should handle bullet points correctly', () => {
      const input = '・Feature 1: Description\n・Feature 2: Description';
      const result = cleanupDetailedSummary(input);
      expect(result).toContain('・Feature 1');
      expect(result).toContain('・Feature 2');
    });
  });
});