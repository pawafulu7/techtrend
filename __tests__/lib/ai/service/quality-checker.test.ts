import { SummaryQualityChecker } from '@/lib/ai/service/quality-checker';
import type { ContentAnalysis } from '@/lib/ai/types';

const VALID_SUMMARY =
  'テスト用の一覧要約テキストを繰り返して十分な長さを確保します。'.repeat(4);

describe('SummaryQualityChecker', () => {
  let checker: SummaryQualityChecker;

  beforeEach(() => {
    checker = new SummaryQualityChecker();
  });

  describe('minDetailedLength boundary tests', () => {
    it('should mark 899-char summary as critical for 5000-char content', () => {
      // Create exactly 899-char detailed summary
      const items = ['x'.repeat(148), 'x'.repeat(148), 'x'.repeat(148), 'x'.repeat(148), 'x'.repeat(148), 'x'.repeat(148)];
      const detailedSummary = items.map(item => `・${item}`).join('\n'); // Total: 899 chars

      const contentAnalysis: ContentAnalysis = {
        totalLength: 5000,
        contentLength: 5000,
        isThinContent: false,
      };

      const result = checker.checkQuality(VALID_SUMMARY, detailedSummary, contentAnalysis);

      expect(result.issues).toContainEqual(
        expect.objectContaining({ type: 'length', severity: 'critical' })
      );
      expect(result.score).toBe(0);
      expect(result.requiresRegeneration).toBe(true);
    });

    it('should pass 900-char summary for 5000-char content', () => {
      // Create exactly 900-char detailed summary
      const items = ['x'.repeat(148), 'x'.repeat(148), 'x'.repeat(148), 'x'.repeat(148), 'x'.repeat(148), 'x'.repeat(149)];
      const detailedSummary = items.map(item => `・${item}`).join('\n'); // Total: 900 chars

      const contentAnalysis: ContentAnalysis = {
        totalLength: 5000,
        contentLength: 5000,
        isThinContent: false,
      };

      const result = checker.checkQuality(VALID_SUMMARY, detailedSummary, contentAnalysis);

      const lengthIssues = result.issues.filter((i) => i.type === 'length');
      expect(lengthIssues).toHaveLength(0);
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it('should pass 1500-char summary for 5000-char content', () => {
      // Create exactly 1500-char detailed summary
      const items = ['x'.repeat(248), 'x'.repeat(248), 'x'.repeat(248), 'x'.repeat(248), 'x'.repeat(248), 'x'.repeat(249)];
      const detailedSummary = items.map(item => `・${item}`).join('\n'); // Total: 1500 chars

      const contentAnalysis: ContentAnalysis = {
        totalLength: 5000,
        contentLength: 5000,
        isThinContent: false,
      };

      const result = checker.checkQuality(VALID_SUMMARY, detailedSummary, contentAnalysis);

      const criticalIssues = result.issues.filter((i) => i.severity === 'critical');
      expect(criticalIssues).toHaveLength(0);
    });

    it('should mark 1501-char summary as minor for 5000-char content', () => {
      // Create exactly 1501-char detailed summary
      const items = ['x'.repeat(248), 'x'.repeat(248), 'x'.repeat(248), 'x'.repeat(248), 'x'.repeat(249), 'x'.repeat(249)];
      const detailedSummary = items.map(item => `・${item}`).join('\n'); // Total: 1501 chars

      const contentAnalysis: ContentAnalysis = {
        totalLength: 5000,
        contentLength: 5000,
        isThinContent: false,
      };

      const result = checker.checkQuality(VALID_SUMMARY, detailedSummary, contentAnalysis);

      expect(result.issues).toContainEqual(
        expect.objectContaining({ type: 'length', severity: 'minor' })
      );
    });
  });

  describe('strict bin enforcement (contentLength >= 5000)', () => {
    it('should enforce critical for contentLength >= 5000 with short summaries', () => {
      const testCases = [
        { contentLength: 5000, detailedLength: 663 },
        { contentLength: 7000, detailedLength: 663 },
        { contentLength: 10000, detailedLength: 663 },
      ];

      testCases.forEach(({ contentLength, detailedLength }) => {
        const detailedSummary = '・Item 1\n・Item 2\n・Item 3\n・Item 4\n・Item 5\n' + 'x'.repeat(detailedLength - 40);

        const contentAnalysis: ContentAnalysis = {
          totalLength: contentLength,
        contentLength,
        isThinContent: false,
      };

        const result = checker.checkQuality(VALID_SUMMARY, detailedSummary, contentAnalysis);

        expect(result.issues).toContainEqual(
          expect.objectContaining({ type: 'length', severity: 'critical' })
        );
        expect(result.requiresRegeneration).toBe(true);
      });
    });

    it('should use major for non-strict bins (contentLength < 5000)', () => {
      const testCases = [
        { contentLength: 1000, minLength: 400, detailedLength: 300 },
        { contentLength: 3000, minLength: 600, detailedLength: 500 },
      ];

      testCases.forEach(({ contentLength, detailedLength }) => {
        const detailedSummary = '・Item 1\n・Item 2\n' + 'x'.repeat(detailedLength - 20);

        const contentAnalysis: ContentAnalysis = {
          totalLength: contentLength,
        contentLength,
        isThinContent: false,
      };

        const result = checker.checkQuality(VALID_SUMMARY, detailedSummary, contentAnalysis);

        expect(result.issues).toContainEqual(
          expect.objectContaining({ type: 'length', severity: 'major' })
        );
        expect(result.score).not.toBe(0); // Should not be critical
      });
    });
  });

  describe('edge cases', () => {
    it('should not enforce strict bin when contentLength is not provided', () => {
      const detailedSummary = '・Item 1\n・Item 2\n' + 'x'.repeat(600);

      const result = checker.checkQuality(VALID_SUMMARY, detailedSummary, undefined);

      const criticalLengthIssues = result.issues.filter(
        (i) => i.type === 'length' && i.severity === 'critical'
      );
      expect(criticalLengthIssues).toHaveLength(0);
    });

    it('should handle contentLength = 5000 exactly (boundary inclusive)', () => {
      const detailedSummary = '・Item 1\n・Item 2\n' + 'x'.repeat(800);

      const contentAnalysis: ContentAnalysis = {
        totalLength: 5000,
        contentLength: 5000,
        isThinContent: false,
      };

      const result = checker.checkQuality(VALID_SUMMARY, detailedSummary, contentAnalysis);

      expect(result.issues).toContainEqual(
        expect.objectContaining({ type: 'length', severity: 'critical' })
      );
    });
  });

  describe('requiresRegeneration logic', () => {
    it('should trigger regeneration for critical length violations in strict bins', () => {
      const detailedSummary = '・Item 1\n・Item 2\n' + 'x'.repeat(800);

      const contentAnalysis: ContentAnalysis = {
        totalLength: 5000,
        contentLength: 5000,
        isThinContent: false,
      };

      const result = checker.checkQuality(VALID_SUMMARY, detailedSummary, contentAnalysis);

      expect(result.requiresRegeneration).toBe(true);
      expect(result.isValid).toBe(false);
    });

    it('should not trigger regeneration for minor length violations', () => {
      const detailedSummary = '・Item 1: ' + 'x'.repeat(240) + '\n・Item 2: ' + 'x'.repeat(240) + '\n・Item 3: ' + 'x'.repeat(240) + '\n・Item 4: ' + 'x'.repeat(240) + '\n・Item 5: ' + 'x'.repeat(240) + '\n・Item 6: ' + 'x'.repeat(241);

      const contentAnalysis: ContentAnalysis = {
        totalLength: 5000,
        contentLength: 5000,
        isThinContent: false,
      };

      const result = checker.checkQuality(VALID_SUMMARY, detailedSummary, contentAnalysis);

      expect(result.requiresRegeneration).toBe(false);
      expect(result.isValid).toBe(true);
    });
  });
});
