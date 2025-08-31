/**
 * Content Analyzer Tests
 * 
 * Tests for content analysis functionality including thin content detection
 * and content level categorization.
 */

import { analyzeContent } from '@/lib/utils/content-analyzer';

describe('content-analyzer', () => {
  describe('analyzeContent', () => {
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
    });

    describe('Content Level Detection', () => {
      it('should correctly categorize content levels', () => {
        const testCases = [
          { content: 'a'.repeat(50), sourceName: undefined, expectedThin: true },
          { content: 'a'.repeat(150), sourceName: undefined, expectedThin: true },
          { content: 'a'.repeat(500), sourceName: undefined, expectedThin: false },
          { content: 'a'.repeat(1500), sourceName: undefined, expectedThin: false },
        ];

        testCases.forEach(({ content, sourceName, expectedThin }) => {
          const analysis = analyzeContent(content, sourceName);
          if (expectedThin) {
            expect(analysis.isThinContent).toBe(true);
            expect(analysis.recommendedMinLength).toBeLessThan(180);
          } else {
            expect(analysis.isThinContent).toBe(false);
            expect(analysis.recommendedMinLength).toBe(180);
          }
        });
      });
    });

    describe('Mixed Source Types', () => {
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

    describe('Normal Content Analysis', () => {
      it('should apply normal criteria for regular content', () => {
        const normalContent = 'a'.repeat(500); // 500文字の通常コンテンツ
        
        const analysis = analyzeContent(normalContent, 'Dev.to');
        
        expect(analysis.isThinContent).toBe(false);
        expect(analysis.recommendedMinLength).toBe(180);
        expect(analysis.recommendedMaxLength).toBe(300);
      });
    });
  });
});