import {
  calculateSummaryScore,
  calculateAverageScore,
  needsRegeneration,
} from '@/lib/utils/quality-scorer';

describe('quality-scorer', () => {
  describe('calculateSummaryScore', () => {
    it('should return high score for well-formatted summary', () => {
      const summary = 'この記事では、ReactのuseStateフックを使った状態管理について詳しく解説しています。初心者にも分かりやすく、実践的なコード例を交えながら説明されており、実務でも活用できる内容となっています。';
      const tags = ['React', 'JavaScript', 'Hook'];
      
      const result = calculateSummaryScore(summary, {
        targetLength: 120,
        isDetailed: false,
        tags,
      });

      // 実装の重み: completeness:30%, length:25%, structure:20%, keywords:15%, clarity:10%
      // 各項目100点満点で採点
      expect(result.totalScore).toBeGreaterThanOrEqual(85);
      expect(result.breakdown.completeness).toBeGreaterThanOrEqual(70);
      expect(result.breakdown.length).toBeGreaterThanOrEqual(80);
      expect(result.breakdown.structure).toBeGreaterThanOrEqual(80);
      expect(result.breakdown.keywords).toBeGreaterThanOrEqual(80);
      expect(result.breakdown.clarity).toBeGreaterThanOrEqual(80);
      expect(result.issues.length).toBeLessThanOrEqual(2);
    });

    it('should return low score for poor quality summary', () => {
      const summary = 'これは記事です。';
      
      const result = calculateSummaryScore(summary);

      // 短い要約: completeness:60(短すぎる-40), length:60(目標から50%以上乖離-40)
      // 実際のスコア: (60*0.3 + 60*0.25 + 100*0.2 + 100*0.15 + 100*0.1) / 100 = 78
      expect(result.totalScore).toBeLessThan(80);
      expect(result.breakdown.completeness).toBeLessThan(70);
      expect(result.breakdown.length).toBeLessThan(70);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.recommendation).toBeDefined();
    });

    it('should handle detailed summary format', () => {
      const summary = `この記事の主要なポイント：
・ReactのuseStateフックの基本的な使い方
・状態管理のベストプラクティス
・パフォーマンス最適化のテクニック
・実際のコード例とその解説
・よくある間違いとその対処法`;
      
      const result = calculateSummaryScore(summary, {
        targetLength: 200,
        isDetailed: true,
      });

      // 詳細要約: 箇条書き5つあり、改行あり = structure 100点
      expect(result.totalScore).toBeGreaterThanOrEqual(60);
      expect(result.breakdown.structure).toBeGreaterThanOrEqual(80);
    });

    it('should evaluate truncated summary', () => {
      const summary = 'この記事では、Reactのコンポーネント設計について説明していて、具体的には';
      
      const result = calculateSummaryScore(summary);

      // completeness: 100 - 30(句点なし) - 40(短すぎる) = 30点
      expect(result.breakdown.completeness).toBeLessThan(40);
      expect(result.issues).toContainEqual(
        expect.stringContaining('句点')
      );
    });

    it('should evaluate too short summary', () => {
      const summary = 'Reactの記事。';
      
      const result = calculateSummaryScore(summary);

      // length: 9文字 → 120文字から大幅に乖離 = 60点
      expect(result.breakdown.length).toBeLessThan(70);
      expect(result.issues).toContainEqual(
        expect.stringContaining('短すぎ')
      );
    });

    it('should evaluate too long summary', () => {
      const summary = 'x'.repeat(300);
      
      const result = calculateSummaryScore(summary, {
        targetLength: 120,
      });

      // length: 300文字 → 120文字から50%以上乖離 = 60点
      expect(result.breakdown.length).toBeLessThan(70);
      expect(result.issues).toContainEqual(
        expect.stringContaining('乖離')
      );
    });

    it('should evaluate keyword presence', () => {
      const summary = 'この記事では、ReactとTypeScriptを使ったWebアプリケーション開発について解説しています。';
      const tags = ['React', 'TypeScript', 'JavaScript'];
      
      const result = calculateSummaryScore(summary, { tags });

      // keywords: 2/3タグがマッチ = 100点
      expect(result.breakdown.keywords).toBeGreaterThanOrEqual(80);
    });

    it('should evaluate without keywords', () => {
      const summary = 'この記事では、プログラミングについて解説しています。';
      const tags = ['React', 'TypeScript', 'JavaScript'];
      
      const result = calculateSummaryScore(summary, { tags });

      // keywords: 0/3タグがマッチ = 50点
      expect(result.breakdown.keywords).toBeLessThanOrEqual(50);
      expect(result.issues).toContainEqual(
        expect.stringContaining('キーワード')
      );
    });
  });

  // Note: evaluate* functions are internal and tested through calculateSummaryScore

  // Note: generateRecommendation is internal and tested through calculateSummaryScore

  describe('needsRegeneration', () => {
    it('should return true for low score', () => {
      const qualityScore = calculateSummaryScore('短い。');
      const result = needsRegeneration(qualityScore);
      
      expect(result).toBe(true);
    });

    it('should return false for high score', () => {
      const qualityScore = calculateSummaryScore(
        'この記事では、ReactのuseStateフックを使った状態管理について詳しく解説しています。初心者にも分かりやすく、実践的なコード例を交えながら説明されています。'
      );
      const result = needsRegeneration(qualityScore);
      
      expect(result).toBe(false);
    });

    it('should return true for truncated text', () => {
      const qualityScore = calculateSummaryScore('この記事では、Reactについて説明して');
      const result = needsRegeneration(qualityScore);
      
      expect(result).toBe(true);
    });

    it('should return false for acceptable score', () => {
      const qualityScore = calculateSummaryScore(
        'ReactとTypeScriptを使ったWebアプリケーション開発の手法について、実践的なコード例を交えながら解説しています。'
      );
      const result = needsRegeneration(qualityScore);
      
      expect(result).toBe(false);
    });
  });

  describe('calculateAverageScore', () => {
    it('should calculate average of multiple summaries', () => {
      const summaries = [
        { summary: 'ReactのuseStateフックを使った状態管理について詳しく解説しています。初心者にも分かりやすく、実践的なコード例を交えながら説明されています。' },
        { summary: 'TypeScriptの型システムについて基本から応用まで解説しています。実際のプロジェクトで使える実践的なパターンを紹介しています。' },
        { summary: 'Next.jsのApp Routerの新機能について解説しています。Server Componentsの活用方法やパフォーマンス最適化のテクニックを紹介しています。' },
      ];
      
      const result = calculateAverageScore(summaries);

      expect(result.averageScore).toBeGreaterThan(70);
      expect(result.distribution).toBeDefined();
      expect(result.totalIssues).toBeDefined();
    });

    it('should handle summaries with tags', () => {
      const summaries = [
        { summary: 'Reactについて解説しています。', tags: ['React'] },
        { summary: 'TypeScriptについて解説しています。', tags: ['TypeScript'] },
      ];
      
      const result = calculateAverageScore(summaries);

      expect(result.averageScore).toBeDefined();
      expect(result.distribution.poor).toBeGreaterThanOrEqual(0);
    });

    it('should calculate distribution correctly', () => {
      const summaries = [
        { summary: 'ReactのuseStateフックを使った状態管理について詳しく解説しています。初心者にも分かりやすく、実践的なコード例を交えながら説明されており、実務でも活用できる内容となっています。' }, // Good score
        { summary: '短い。' }, // Poor score (low score)
      ];
      
      const result = calculateAverageScore(summaries);

      // 短い要約は低スコアになるはず
      expect(result.distribution.poor + result.distribution.fair).toBeGreaterThan(0);
      expect(Object.values(result.distribution).reduce((a, b) => a + b)).toBe(summaries.length);
    });

    it('should aggregate all issues', () => {
      const summaries = [
        { summary: '短い。' },
        { summary: 'この記事では、説明して' },
      ];
      
      const result = calculateAverageScore(summaries);

      expect(result.totalIssues.length).toBeGreaterThan(0);
      expect(Array.isArray(result.totalIssues)).toBe(true);
    });
  });

  // Note: SCORING_WEIGHTS is internal and not exported
});