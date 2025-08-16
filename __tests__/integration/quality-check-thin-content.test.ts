/**
 * 品質チェック機能のテスト（薄いコンテンツ対応）
 */

import { checkSummaryQuality } from '../../lib/utils/summary-quality-checker';
import { analyzeContent, ContentAnalysis } from '../../lib/utils/content-analyzer';

describe('Quality Check for Thin Content', () => {
  describe('Thin Content Quality Criteria', () => {
    it('should accept 60-100 character summaries for thin content', () => {
      const analysis: ContentAnalysis = {
        isThinContent: true,
        contentLength: 50,
        sourceName: 'Speaker Deck',
        recommendedMinLength: 60,
        recommendedMaxLength: 100
      };

      // 適切な長さの要約（60文字以上）
      const goodSummary = 'WebAssemblyの実装方法について詳しく解説したプレゼンテーション資料。技術的な詳細と具体的な実装例を豊富に含む。';
      const detailedSummary = '利用可能な情報が限定的なため、詳細な要約は作成できません。元記事を参照してください。';
      
      const result = checkSummaryQuality(goodSummary, detailedSummary, analysis);
      
      expect(result.isValid).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.requiresRegeneration).toBe(false);
    });

    it('should reject summaries shorter than 60 characters for thin content', () => {
      const analysis: ContentAnalysis = {
        isThinContent: true,
        contentLength: 50,
        sourceName: 'Speaker Deck',
        recommendedMinLength: 60,
        recommendedMaxLength: 100
      };

      // 短すぎる要約（30文字）
      const shortSummary = 'プレゼンテーション資料です。';
      const detailedSummary = '利用可能な情報が限定的なため、詳細な要約は作成できません。元記事を参照してください。';
      
      const result = checkSummaryQuality(shortSummary, detailedSummary, analysis);
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          type: 'length',
          severity: 'major',
          message: expect.stringContaining('短すぎる')
        })
      );
    });

    it('should warn about summaries longer than 100 characters for thin content', () => {
      const analysis: ContentAnalysis = {
        isThinContent: true,
        contentLength: 50,
        sourceName: 'Speaker Deck',
        recommendedMinLength: 60,
        recommendedMaxLength: 100
      };

      // 長すぎる要約（150文字）
      const longSummary = 'このプレゼンテーション資料では、WebAssemblyの基本的な概念から始まり、実装方法、パフォーマンス最適化、実際のユースケースまで幅広く解説されています。特にブラウザでの動作原理について詳しく説明されており、開発者にとって有益な情報が含まれています。';
      const detailedSummary = '利用可能な情報が限定的なため、詳細な要約は作成できません。元記事を参照してください。';
      
      const result = checkSummaryQuality(longSummary, detailedSummary, analysis);
      
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          type: 'length',
          severity: 'major',  // 薄いコンテンツで100文字超はmajor
          message: expect.stringContaining('長すぎる')
        })
      );
    });

    it('should strictly reject speculation in thin content', () => {
      const analysis: ContentAnalysis = {
        isThinContent: true,
        contentLength: 50,
        sourceName: 'Speaker Deck',
        recommendedMinLength: 60,
        recommendedMaxLength: 100
      };

      // 推測表現を含む要約
      const speculativeSummary = 'WebAssemblyについて説明していると思われるプレゼンテーション。おそらく実装方法を解説。';
      const detailedSummary = '利用可能な情報が限定的なため、詳細な要約は作成できません。元記事を参照してください。';
      
      const result = checkSummaryQuality(speculativeSummary, detailedSummary, analysis);
      
      expect(result.requiresRegeneration).toBe(true);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          type: 'speculative',
          severity: 'critical',
          message: expect.stringContaining('推測表現は厳禁')
        })
      );
    });
  });

  describe('Normal Content Quality Criteria', () => {
    it('should apply standard criteria for normal content', () => {
      const analysis: ContentAnalysis = {
        isThinContent: false,
        contentLength: 1000,
        recommendedMinLength: 180,
        recommendedMaxLength: 250
      };

      // 標準的な要約
      const normalSummary = 'この記事では、TypeScriptを使用したWebアプリケーション開発について詳しく解説しています。特にReactとの統合方法、型安全性の確保、パフォーマンス最適化のテクニックが紹介されています。実際のコード例を交えながら、実践的な開発手法を学ぶことができます。';
      const detailedSummary = `・TypeScriptの基本的な型システムと、Reactコンポーネントでの活用方法について説明
・型推論を活用した効率的なコーディング手法と、型安全性を保ちながら開発速度を向上させる方法を紹介
・実際のプロジェクトで遭遇しやすい型エラーの解決方法と、デバッグのテクニックを解説
・パフォーマンス最適化のための型定義の工夫と、バンドルサイズを削減する方法について説明
・大規模プロジェクトでのTypeScript導入時の注意点と、段階的な移行戦略を提案`;
      
      const result = checkSummaryQuality(normalSummary, detailedSummary, analysis);
      
      expect(result.isValid).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it('should require bullet points in detailed summary for normal content', () => {
      const analysis: ContentAnalysis = {
        isThinContent: false,
        contentLength: 1000,
        recommendedMinLength: 180,
        recommendedMaxLength: 250
      };

      const normalSummary = 'この記事では、TypeScriptを使用したWebアプリケーション開発について詳しく解説しています。';
      const detailedWithoutBullets = 'TypeScriptの基本的な型システムとReactコンポーネントでの活用方法について説明しています。型推論を活用した効率的なコーディング手法も紹介されています。';
      
      const result = checkSummaryQuality(normalSummary, detailedWithoutBullets, analysis);
      
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          type: 'format',
          severity: 'major',
          message: expect.stringContaining('箇条書き')
        })
      );
    });
  });

  describe('Dynamic Analysis Integration', () => {
    it('should correctly analyze and check Speaker Deck content', () => {
      const content = 'https://example.com/slides';
      const analysis = analyzeContent(content, 'Speaker Deck');
      
      const summary = 'WebAssemblyに関する技術的な内容を詳しく解説したプレゼンテーション資料です。実装例も非常に豊富に紹介されている。';
      const detailed = '利用可能な情報が限定的なため、詳細な要約は作成できません。元記事を参照してください。';
      
      const result = checkSummaryQuality(summary, detailed, analysis);
      
      expect(analysis.isThinContent).toBe(true);
      expect(result.isValid).toBe(true);
    });

    it('should correctly analyze and check Dev.to content', () => {
      const content = 'a'.repeat(1000); // 1000文字の通常コンテンツ
      const analysis = analyzeContent(content, 'Dev.to');
      
      const summary = 'a'.repeat(150) + '。';
      const detailed = '・項目1の説明\n・項目2の説明\n・項目3の説明';
      
      const result = checkSummaryQuality(summary, detailed, analysis);
      
      expect(analysis.isThinContent).toBe(false);
      expect(analysis.recommendedMinLength).toBe(180);
    });
  });
});