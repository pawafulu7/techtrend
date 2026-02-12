import { SummaryQualityChecker } from '../quality-checker';
import { ContentAnalysis } from '../quality-checker.interface';

describe('SummaryQualityChecker', () => {
  let checker: SummaryQualityChecker;

  beforeEach(() => {
    checker = new SummaryQualityChecker();
  });

  describe('基本的な品質チェック', () => {
    it('should pass quality check for valid summary', () => {
      const summary =
        'TypeScriptの型システムを詳しく解説し、型安全性を保ちながら柔軟なコードを書く方法を紹介する。プリミティブ型からジェネリクス、ユニオン型まで、実践的な例とともに段階的に理解を深めていく構成となっている。';
      const detailedSummary = `・概要：TypeScriptの基本的な型システムの紹介と背景
・基本型：プリミティブ型とオブジェクト型の使い分け方
・高度な型：ジェネリクス、ユニオン型、インターセクション型の活用方法
・実践例：実際のプロジェクトでの型定義のベストプラクティス
・まとめ：型システムを活用した安全なコード設計の重要性`;

      const result = checker.checkQuality(summary, detailedSummary);

      expect(result.isValid).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.issues.length).toBe(0);
    });

    it('should detect summary that is too short', () => {
      const summary = 'TypeScriptの記事。';
      const detailedSummary = `・概要：TypeScriptの基本
・基本型：型の使い方
・実践例：プロジェクト例`;

      const result = checker.checkQuality(summary, detailedSummary);

      expect(result.isValid).toBe(false);
      expect(result.issues.some((issue) => issue.type === 'length')).toBe(true);
      expect(result.score).toBeLessThan(100);
    });

    it('should detect detailed summary that is too short', () => {
      const summary =
        'TypeScriptの型システムを詳しく解説し、型安全性を保ちながら柔軟なコードを書く方法を紹介する。';
      const detailedSummary = '・概要：TypeScript';

      const result = checker.checkQuality(summary, detailedSummary);

      expect(result.isValid).toBe(false);
      expect(result.issues.some((issue) => issue.type === 'length')).toBe(true);
    });

    it('should detect missing sentence ending punctuation', () => {
      const summary = 'TypeScriptの型システムについて解説';
      const detailedSummary = `・概要：TypeScriptの基本的な型システム
・基本型：プリミティブ型とオブジェクト型
・実践例：実際のプロジェクト例`;

      const result = checker.checkQuality(summary, detailedSummary);

      expect(result.issues.some((issue) => issue.type === 'punctuation')).toBe(
        true
      );
    });
  });

  describe('コンテンツ長に応じた品質チェック', () => {
    it('should apply strict item count check for long content', () => {
      const summary =
        'Reactの高度なパターンを詳細に解説し、パフォーマンス最適化からコンポーネント設計まで幅広くカバーする。';
      const detailedSummary = `・概要：Reactの高度なパターン
・パフォーマンス：最適化手法
・設計：コンポーネント設計のベストプラクティス`;

      const contentAnalysis: ContentAnalysis = {
        contentLength: 6000,
        totalLength: 6000,
        isThinContent: false,
      };

      const result = checker.checkQuality(
        summary,
        detailedSummary,
        contentAnalysis
      );

      expect(result.issues.some((issue) => issue.type === 'itemCount')).toBe(
        true
      );
      expect(result.itemCount).toBe(3);
      expect(result.itemCountValid).toBe(false);
    });

    it('should pass item count check for sufficient items in long content', () => {
      const summary =
        'Reactの高度なパターンを詳細に解説し、パフォーマンス最適化からコンポーネント設計まで幅広くカバーする。';
      const detailedSummary = `・概要：Reactの高度なパターン紹介と背景
・Hooks：useCallback、useMemoを使った最適化
・Context：コンテキストを使った状態管理のパターン
・パフォーマンス：React.memoとコード分割の活用
・設計：コンポーネント設計のベストプラクティスとパターン`;

      const contentAnalysis: ContentAnalysis = {
        contentLength: 6000,
        totalLength: 6000,
        isThinContent: false,
      };

      const result = checker.checkQuality(
        summary,
        detailedSummary,
        contentAnalysis
      );

      expect(result.itemCount).toBe(5);
      expect(result.itemCountValid).toBe(true);
    });

    it('should require more items for very long content', () => {
      const summary =
        'Next.jsの包括的なガイドとして、サーバーサイドレンダリングから静的サイト生成、APIルートまで全てをカバーする。';
      const detailedSummary = `・概要：Next.jsの包括的ガイド
・SSR：サーバーサイドレンダリングの実装方法
・SSG：静的サイト生成の利点と使い方
・API：APIルートの作成と活用
・デプロイ：Vercelへのデプロイ手順`;

      const contentAnalysis: ContentAnalysis = {
        contentLength: 12000,
        totalLength: 12000,
        isThinContent: false,
      };

      const result = checker.checkQuality(
        summary,
        detailedSummary,
        contentAnalysis
      );

      expect(result.issues.some((issue) => issue.type === 'itemCount')).toBe(
        true
      );
      expect(result.itemCount).toBe(5);
      expect(result.itemCountValid).toBe(false);
    });
  });

  describe('推測表現の検出', () => {
    it('should detect speculative expressions', () => {
      const summary =
        'TypeScriptについて解説していると考えられます。型システムが使われているようです。';
      const detailedSummary = `・概要：TypeScriptの基本的な型システムかもしれません
・基本型：プリミティブ型が使われているでしょう
・実践例：プロジェクト例があると思われます`;

      const result = checker.checkQuality(summary, detailedSummary);

      expect(result.speculativeExpressions).toBeDefined();
      expect(result.speculativeExpressions!.count).toBeGreaterThan(0);
      expect(result.issues.some((issue) => issue.type === 'speculative')).toBe(
        true
      );
    });

    it('should apply strict check for thin content with speculative expressions', () => {
      const summary = '技術的な内容について解説していると考えられます。';
      const detailedSummary = '・概要：基本的な内容があるようです';

      const contentAnalysis: ContentAnalysis = {
        contentLength: 500,
        totalLength: 500,
        isThinContent: true,
        recommendedMinLength: 60,
        recommendedMaxLength: 100,
      };

      const result = checker.checkQuality(
        summary,
        detailedSummary,
        contentAnalysis
      );

      expect(result.issues.some((issue) => issue.severity === 'critical')).toBe(
        true
      );
      expect(result.requiresRegeneration).toBe(true);
    });
  });

  describe('形式チェック', () => {
    it('should detect missing bullet points in detailed summary', () => {
      const summary =
        'TypeScriptの型システムを詳しく解説し、型安全性を保ちながら柔軟なコードを書く方法を紹介する。';
      const detailedSummary = 'TypeScriptの基本的な型システムを紹介します';

      const result = checker.checkQuality(summary, detailedSummary);

      expect(result.issues.some((issue) => issue.type === 'format')).toBe(true);
    });

    it('should detect empty bullet points', () => {
      const summary =
        'TypeScriptの型システムを詳しく解説し、型安全性を保ちながら柔軟なコードを書く方法を紹介する。';
      const detailedSummary = `・概要：TypeScriptの基本
・
・実践例：プロジェクト例`;

      const result = checker.checkQuality(summary, detailedSummary);

      expect(
        result.issues.some(
          (issue) => issue.type === 'format' && issue.severity === 'critical'
        )
      ).toBe(true);
    });
  });

  describe('重複検出', () => {
    it('should detect identical summary and detailed summary', () => {
      const text = 'TypeScriptの型システムについて解説しています。';

      const result = checker.checkQuality(text, text);

      expect(result.issues.some((issue) => issue.type === 'duplicate')).toBe(
        true
      );
      expect(result.score).toBe(0);
    });

    it('should detect similar beginning in summary and detailed summary', () => {
      const summary =
        'TypeScriptの型システムを詳しく解説し、型安全性を保ちながら柔軟なコードを書く方法を紹介する。さらに実践的な例も紹介する。';
      const detailedSummary =
        'TypeScriptの型システムを詳しく解説し、型安全性を保ちながら柔軟なコードを書く方法を紹介する。';

      const result = checker.checkQuality(summary, detailedSummary);

      expect(result.issues.some((issue) => issue.type === 'duplicate')).toBe(
        true
      );
    });
  });

  describe('薄いコンテンツの処理', () => {
    it('should apply lenient checks for thin content', () => {
      const summary =
        '新しい機能を簡単に紹介し、基本的な使い方を学べる内容となっている。初心者にも分かりやすく解説されている。';
      const detailedSummary =
        '新機能の概要と基本的な使い方について説明しています。初心者向けに分かりやすく書かれた内容となっています。';

      const contentAnalysis: ContentAnalysis = {
        contentLength: 500,
        totalLength: 500,
        isThinContent: true,
        recommendedMinLength: 60,
        recommendedMaxLength: 100,
      };

      const result = checker.checkQuality(
        summary,
        detailedSummary,
        contentAnalysis
      );

      expect(result.isValid).toBe(true);
    });

    it('should reject thin content with too short summary', () => {
      const summary = '新機能の紹介。';
      const detailedSummary = '新機能について';

      const contentAnalysis: ContentAnalysis = {
        contentLength: 500,
        totalLength: 500,
        isThinContent: true,
        recommendedMinLength: 60,
        recommendedMaxLength: 100,
      };

      const result = checker.checkQuality(
        summary,
        detailedSummary,
        contentAnalysis
      );

      expect(result.isValid).toBe(false);
    });
  });

  describe('calculateScore', () => {
    it('should calculate score with speculative penalty', () => {
      const summary =
        'TypeScriptについて解説していると考えられます。型システムが使われているようです。';
      const detailedSummary = `・概要：TypeScriptの基本的な型システムかもしれません
・基本型：プリミティブ型が使われているでしょう
・実践例：プロジェクト例があると思われます`;

      const score = checker.calculateScore(summary, detailedSummary, 2.0);

      expect(score).toBeLessThan(100);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should return high score for quality content without speculation', () => {
      const summary =
        'TypeScriptの型システムを詳しく解説し、型安全性を保ちながら柔軟なコードを書く方法を紹介する。';
      const detailedSummary = `・概要：TypeScriptの基本的な型システムの紹介
・基本型：プリミティブ型とオブジェクト型の使い分け
・実践例：実際のプロジェクトでの型定義のベストプラクティス`;

      const score = checker.calculateScore(summary, detailedSummary);

      expect(score).toBeGreaterThanOrEqual(90);
    });
  });

  describe('requiresRegeneration', () => {
    it('should require regeneration for critical issues', () => {
      const summary = 'TypeScript。';
      const detailedSummary = '・';

      const result = checker.checkQuality(summary, detailedSummary);

      expect(result.requiresRegeneration).toBe(true);
    });

    it('should require regeneration for low score', () => {
      process.env.QUALITY_MIN_SCORE = '70';

      const summary = 'TypeScriptについて。';
      const detailedSummary = '・TypeScript';

      const result = checker.checkQuality(summary, detailedSummary);

      expect(result.requiresRegeneration).toBe(true);
    });

    it('should require regeneration for insufficient items in long content', () => {
      const summary =
        'Reactを詳細に解説し、パフォーマンス最適化からコンポーネント設計まで幅広くカバーする。';
      const detailedSummary = `・概要：Reactの基本
・実践：プロジェクト例`;

      const contentAnalysis: ContentAnalysis = {
        contentLength: 6000,
        totalLength: 6000,
        isThinContent: false,
      };

      const result = checker.checkQuality(
        summary,
        detailedSummary,
        contentAnalysis
      );

      expect(result.requiresRegeneration).toBe(true);
    });
  });
});
