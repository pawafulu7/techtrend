/**
 * 薄いコンテンツの要約生成統合テスト
 */

import { analyzeContent } from '../../lib/utils/content-analyzer';
import { checkSummaryQuality } from '../../lib/utils/summary-quality-checker';

describe('Thin Content Summary Integration', () => {
  describe('Speaker Deck Content Analysis', () => {
    it('should correctly identify Speaker Deck content as thin', () => {
      // 実際のSpeaker Deckコンテンツの例
      const speakerDeckContent = 'https://kernelvm.connpass.com/event/355100/';
      const analysis = analyzeContent(speakerDeckContent, 'Speaker Deck');
      
      expect(analysis.isThinContent).toBe(true);
      expect(analysis.recommendedMinLength).toBe(60);
      expect(analysis.recommendedMaxLength).toBe(100);
      expect(analysis.sourceName).toBe('Speaker Deck');
    });

    it('should handle various Speaker Deck content lengths', () => {
      const testCases = [
        { content: 'URL only', length: 8 },
        { content: 'https://example.com/event/123', length: 29 },
        { content: 'a'.repeat(500), length: 500 }, // 長いコンテンツでもSpeaker Deckは薄いと判定
      ];

      testCases.forEach(({ content, length }) => {
        const analysis = analyzeContent(content, 'Speaker Deck');
        expect(analysis.isThinContent).toBe(true);
        expect(analysis.contentLength).toBe(length);
      });
    });
  });

  describe('Quality Check with Content Analysis', () => {
    it('should apply thin content criteria for Speaker Deck', () => {
      // 60文字以上の適切な長さの要約を用意
      const thinSummary = 'WebAssemblyインタプリタの実装について詳しく解説したプレゼンテーション資料。技術的な詳細と実装方法を豊富に説明。';
      const detailedSummary = '利用可能な情報が限定的なため、詳細な要約は作成できません。元記事を参照してください。';
      
      const analysis = analyzeContent('https://example.com', 'Speaker Deck');
      const qualityCheck = checkSummaryQuality(thinSummary, detailedSummary, analysis);
      
      // 薄いコンテンツ用の基準が適用されることを確認
      expect(qualityCheck.isValid).toBe(true);
      expect(qualityCheck.score).toBeGreaterThanOrEqual(60);
      
      // 60-100文字の範囲内なら問題なし
      const summaryLength = thinSummary.length;
      expect(summaryLength).toBeGreaterThanOrEqual(60);
      expect(summaryLength).toBeLessThanOrEqual(100);
    });

    it('should reject speculation in thin content', () => {
      const speculativeSummary = 'このプレゼンテーションでは、おそらくWebAssemblyの最新機能について説明していると思われます。';
      const detailedSummary = '利用可能な情報が限定的なため、詳細な要約は作成できません。元記事を参照してください。';
      
      const analysis = analyzeContent('URL', 'Speaker Deck');
      const qualityCheck = checkSummaryQuality(speculativeSummary, detailedSummary, analysis);
      
      // 推測表現があると厳しく評価される
      expect(qualityCheck.issues).toContainEqual(
        expect.objectContaining({
          type: 'speculative',
          severity: 'critical'
        })
      );
      expect(qualityCheck.requiresRegeneration).toBe(true);
    });

    it('should apply normal criteria for regular content', () => {
      const normalContent = 'a'.repeat(500); // 500文字の通常コンテンツ
      const normalSummary = 'a'.repeat(150) + '。'; // 150文字の要約
      const detailedSummary = '・項目1\n・項目2\n・項目3\n・項目4\n・項目5';
      
      const analysis = analyzeContent(normalContent, 'Dev.to');
      const qualityCheck = checkSummaryQuality(normalSummary, detailedSummary, analysis);
      
      // 通常コンテンツの基準が適用される
      expect(analysis.isThinContent).toBe(false);
      expect(analysis.recommendedMinLength).toBe(180);
      
      // 詳細要約に箇条書きがあるので、formatのissueはないはず
      const issues = qualityCheck.issues.filter(i => i.type === 'format');
      expect(issues.length).toBe(0);
    });
  });

  describe('Content Level Detection', () => {
    it('should correctly categorize content levels', () => {
      const testCases = [
        { content: 'a'.repeat(50), expected: 'very-thin' },
        { content: 'a'.repeat(150), expected: 'thin' },
        { content: 'a'.repeat(500), expected: 'normal' },
        { content: 'a'.repeat(1500), expected: 'rich' },
      ];

      testCases.forEach(({ content, expected }) => {
        const _analysis = analyzeContent(content);
        const { getContentLevel } = require('../../lib/utils/content-analyzer');
        const level = getContentLevel(content);
        expect(level).toBe(expected);
      });
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle actual Speaker Deck URLs correctly', () => {
      const realUrls = [
        'https://speakerdeck.com/user/presentation',
        'https://example.connpass.com/event/123456/',
        'プレゼンテーション資料',
        '',
      ];

      realUrls.forEach(url => {
        const analysis = analyzeContent(url, 'Speaker Deck');
        expect(analysis.isThinContent).toBe(true);
        expect(analysis.recommendedMinLength).toBe(60);
        expect(analysis.recommendedMaxLength).toBe(100);
      });
    });

    it('should handle mixed source types correctly', () => {
      const sources = [
        { name: 'Speaker Deck', content: 'long content'.repeat(100), expectThin: true },
        { name: 'Dev.to', content: 'short', expectThin: true },
        { name: 'Dev.to', content: 'long content'.repeat(100), expectThin: false },
        { name: 'Qiita', content: 'short', expectThin: true },
        { name: 'Qiita', content: 'long content'.repeat(100), expectThin: false },
      ];

      sources.forEach(({ name, content, expectThin }) => {
        const analysis = analyzeContent(content, name);
        expect(analysis.isThinContent).toBe(expectThin);
      });
    });
  });
});