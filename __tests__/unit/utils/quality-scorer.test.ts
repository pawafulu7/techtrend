import {
  calculateSummaryScore,
  calculateAverageScore,
  needsRegeneration,
  evaluateCompleteness,
  evaluateLength,
  evaluateStructure,
  evaluateKeywords,
  evaluateClarity,
  generateRecommendation,
  SCORING_WEIGHTS,
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

      expect(result.totalScore).toBeGreaterThanOrEqual(70);
      expect(result.breakdown.completeness).toBeGreaterThan(20);
      expect(result.breakdown.length).toBeGreaterThan(15);
      expect(result.breakdown.structure).toBeGreaterThan(10);
      expect(result.breakdown.keywords).toBeGreaterThan(10);
      expect(result.breakdown.clarity).toBeGreaterThan(5);
      expect(result.issues.length).toBeLessThanOrEqual(3);
    });

    it('should return low score for poor quality summary', () => {
      const summary = 'これは記事です。';
      
      const result = calculateSummaryScore(summary);

      expect(result.totalScore).toBeLessThan(50);
      expect(result.breakdown.completeness).toBeLessThan(15);
      expect(result.breakdown.length).toBeLessThan(10);
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

      expect(result.totalScore).toBeGreaterThanOrEqual(60);
      expect(result.breakdown.structure).toBeGreaterThan(15);
    });

    it('should evaluate truncated summary', () => {
      const summary = 'この記事では、Reactのコンポーネント設計について説明していて、具体的には';
      
      const result = calculateSummaryScore(summary);

      expect(result.breakdown.completeness).toBeLessThan(15);
      expect(result.issues).toContainEqual(
        expect.stringContaining('途切れ')
      );
    });

    it('should evaluate too short summary', () => {
      const summary = 'Reactの記事。';
      
      const result = calculateSummaryScore(summary);

      expect(result.breakdown.length).toBeLessThan(10);
      expect(result.issues).toContainEqual(
        expect.stringContaining('短すぎ')
      );
    });

    it('should evaluate too long summary', () => {
      const summary = 'x'.repeat(300);
      
      const result = calculateSummaryScore(summary, {
        targetLength: 120,
      });

      expect(result.breakdown.length).toBeLessThan(20);
      expect(result.issues).toContainEqual(
        expect.stringContaining('長すぎ')
      );
    });

    it('should evaluate keyword presence', () => {
      const summary = 'この記事では、ReactとTypeScriptを使ったWebアプリケーション開発について解説しています。';
      const tags = ['React', 'TypeScript', 'JavaScript'];
      
      const result = calculateSummaryScore(summary, { tags });

      expect(result.breakdown.keywords).toBeGreaterThan(10);
    });

    it('should evaluate without keywords', () => {
      const summary = 'この記事では、プログラミングについて解説しています。';
      const tags = ['React', 'TypeScript', 'JavaScript'];
      
      const result = calculateSummaryScore(summary, { tags });

      expect(result.breakdown.keywords).toBeLessThan(10);
      expect(result.issues).toContainEqual(
        expect.stringContaining('キーワード')
      );
    });
  });

  describe('evaluateCompleteness', () => {
    it('should give high score for complete sentences', () => {
      const summary = 'この記事では、Reactの基本的な使い方について解説しています。';
      const issues: string[] = [];
      
      const score = evaluateCompleteness(summary, issues);

      expect(score).toBeGreaterThan(25);
      expect(issues.length).toBe(0);
    });

    it('should detect truncated text', () => {
      const summary = 'この記事では、Reactの基本的な使い方について';
      const issues: string[] = [];
      
      const score = evaluateCompleteness(summary, issues);

      expect(score).toBeLessThan(20);
      expect(issues).toContainEqual(
        expect.stringContaining('途切れ')
      );
    });

    it('should detect sentences ending with particles', () => {
      const summary = 'Reactの基本的な使い方を説明しており、';
      const issues: string[] = [];
      
      const score = evaluateCompleteness(summary, issues);

      expect(score).toBeLessThan(20);
      expect(issues.length).toBeGreaterThan(0);
    });

    it('should accept properly punctuated text', () => {
      const summary = 'Reactの基本的な使い方を説明しています。実装例も豊富です。';
      const issues: string[] = [];
      
      const score = evaluateCompleteness(summary, issues);

      expect(score).toBeGreaterThanOrEqual(25);
      expect(issues.length).toBe(0);
    });
  });

  describe('evaluateLength', () => {
    it('should give high score for optimal length', () => {
      const summary = 'x'.repeat(120);
      const issues: string[] = [];
      
      const score = evaluateLength(summary, 120, false, issues);

      expect(score).toBeGreaterThan(20);
      expect(issues.length).toBe(0);
    });

    it('should penalize too short summary', () => {
      const summary = 'x'.repeat(30);
      const issues: string[] = [];
      
      const score = evaluateLength(summary, 120, false, issues);

      expect(score).toBeLessThan(15);
      expect(issues).toContainEqual(
        expect.stringContaining('短すぎ')
      );
    });

    it('should penalize too long summary', () => {
      const summary = 'x'.repeat(250);
      const issues: string[] = [];
      
      const score = evaluateLength(summary, 120, false, issues);

      expect(score).toBeLessThan(20);
      expect(issues).toContainEqual(
        expect.stringContaining('長すぎ')
      );
    });

    it('should handle detailed summary length', () => {
      const summary = 'x'.repeat(200);
      const issues: string[] = [];
      
      const score = evaluateLength(summary, 200, true, issues);

      expect(score).toBeGreaterThan(20);
      expect(issues.length).toBe(0);
    });
  });

  describe('evaluateStructure', () => {
    it('should give high score for well-structured summary', () => {
      const summary = 'この記事では、Reactの基本について解説しています。具体的には、コンポーネントの作成方法、状態管理、そしてフックの使い方を説明しています。';
      const issues: string[] = [];
      
      const score = evaluateStructure(summary, false, issues);

      expect(score).toBeGreaterThan(15);
    });

    it('should give high score for bullet-point structure', () => {
      const summary = `主要なポイント：
・Reactの基本概念
・コンポーネントの作成
・状態管理の方法`;
      const issues: string[] = [];
      
      const score = evaluateStructure(summary, true, issues);

      expect(score).toBeGreaterThan(15);
    });

    it('should penalize poor structure', () => {
      const summary = 'ReactとJavaScriptとTypeScriptとHTMLとCSSについて説明しています';
      const issues: string[] = [];
      
      const score = evaluateStructure(summary, false, issues);

      expect(score).toBeLessThan(15);
    });

    it('should detect missing bullet points in detailed format', () => {
      const summary = 'これは詳細な要約です。箇条書きがありません。';
      const issues: string[] = [];
      
      const score = evaluateStructure(summary, true, issues);

      expect(score).toBeLessThan(10);
      expect(issues).toContainEqual(
        expect.stringContaining('箇条書き')
      );
    });
  });

  describe('evaluateKeywords', () => {
    it('should give high score when keywords match', () => {
      const summary = 'ReactとTypeScriptを使った開発について解説しています。';
      const tags = ['React', 'TypeScript'];
      const issues: string[] = [];
      
      const score = evaluateKeywords(summary, tags, issues);

      expect(score).toBe(15);
      expect(issues.length).toBe(0);
    });

    it('should give partial score for partial matches', () => {
      const summary = 'Reactを使った開発について解説しています。';
      const tags = ['React', 'TypeScript', 'JavaScript'];
      const issues: string[] = [];
      
      const score = evaluateKeywords(summary, tags, issues);

      expect(score).toBeGreaterThan(5);
      expect(score).toBeLessThan(15);
    });

    it('should give low score when no keywords match', () => {
      const summary = 'プログラミングについて解説しています。';
      const tags = ['React', 'TypeScript', 'JavaScript'];
      const issues: string[] = [];
      
      const score = evaluateKeywords(summary, tags, issues);

      expect(score).toBeLessThan(5);
      expect(issues).toContainEqual(
        expect.stringContaining('キーワード')
      );
    });

    it('should handle empty tags', () => {
      const summary = 'Reactを使った開発について解説しています。';
      const tags: string[] = [];
      const issues: string[] = [];
      
      const score = evaluateKeywords(summary, tags, issues);

      expect(score).toBe(10);
    });
  });

  describe('evaluateClarity', () => {
    it('should give high score for clear summary', () => {
      const summary = 'この記事では、Reactの基本的な使い方について解説しています。初心者にも分かりやすい内容です。';
      const issues: string[] = [];
      
      const score = evaluateClarity(summary, issues);

      expect(score).toBeGreaterThan(7);
      expect(issues.length).toBe(0);
    });

    it('should detect vague expressions', () => {
      const summary = 'この記事は、いろいろなことについて説明している記事です。';
      const issues: string[] = [];
      
      const score = evaluateClarity(summary, issues);

      expect(score).toBeLessThan(7);
      expect(issues).toContainEqual(
        expect.stringContaining('曖昧')
      );
    });

    it('should detect redundant expressions', () => {
      const summary = 'この記事では、記事の内容について記事で説明しています。';
      const issues: string[] = [];
      
      const score = evaluateClarity(summary, issues);

      expect(score).toBeLessThan(7);
      expect(issues.length).toBeGreaterThan(0);
    });

    it('should give high score for technical summary', () => {
      const summary = 'ReactのuseStateフックを使用して、コンポーネントの状態管理を実装する方法を解説しています。';
      const issues: string[] = [];
      
      const score = evaluateClarity(summary, issues);

      expect(score).toBeGreaterThanOrEqual(7);
    });
  });

  describe('generateRecommendation', () => {
    it('should return no recommendation for high score', () => {
      const recommendation = generateRecommendation(85, []);
      
      expect(recommendation).toBeUndefined();
    });

    it('should generate recommendation for medium score', () => {
      const issues = ['要約が短すぎます', 'キーワードが不足しています'];
      const recommendation = generateRecommendation(65, issues);
      
      expect(recommendation).toBeDefined();
      expect(recommendation).toContain('改善');
    });

    it('should recommend regeneration for low score', () => {
      const issues = ['文章が途切れています', '要約が短すぎます'];
      const recommendation = generateRecommendation(45, issues);
      
      expect(recommendation).toBeDefined();
      expect(recommendation).toContain('再生成');
    });

    it('should include specific issues in recommendation', () => {
      const issues = ['文章が途切れています', 'キーワードが不足しています'];
      const recommendation = generateRecommendation(55, issues);
      
      expect(recommendation).toContain('文章が途切れています');
      expect(recommendation).toContain('キーワードが不足しています');
    });
  });

  describe('needsRegeneration', () => {
    it('should return true for low score', () => {
      const result = needsRegeneration(45);
      
      expect(result).toBe(true);
    });

    it('should return false for high score', () => {
      const result = needsRegeneration(75);
      
      expect(result).toBe(false);
    });

    it('should return true for score exactly at threshold', () => {
      const result = needsRegeneration(60);
      
      expect(result).toBe(true);
    });

    it('should return false for score just above threshold', () => {
      const result = needsRegeneration(61);
      
      expect(result).toBe(false);
    });
  });

  describe('calculateAverageScore', () => {
    it('should calculate average of multiple scores', () => {
      const scores = [80, 70, 90, 60];
      
      const average = calculateAverageScore(scores);

      expect(average).toBe(75);
    });

    it('should handle empty array', () => {
      const scores: number[] = [];
      
      const average = calculateAverageScore(scores);

      expect(average).toBe(0);
    });

    it('should handle single score', () => {
      const scores = [85];
      
      const average = calculateAverageScore(scores);

      expect(average).toBe(85);
    });

    it('should round to integer', () => {
      const scores = [80, 75, 90];
      
      const average = calculateAverageScore(scores);

      expect(average).toBe(82); // (80 + 75 + 90) / 3 = 81.666... → 82
    });
  });

  describe('SCORING_WEIGHTS', () => {
    it('should have correct weight values', () => {
      expect(SCORING_WEIGHTS.completeness).toBe(30);
      expect(SCORING_WEIGHTS.length).toBe(25);
      expect(SCORING_WEIGHTS.structure).toBe(20);
      expect(SCORING_WEIGHTS.keywords).toBe(15);
      expect(SCORING_WEIGHTS.clarity).toBe(10);
    });

    it('should sum up to 100', () => {
      const totalWeight = 
        SCORING_WEIGHTS.completeness +
        SCORING_WEIGHTS.length +
        SCORING_WEIGHTS.structure +
        SCORING_WEIGHTS.keywords +
        SCORING_WEIGHTS.clarity;

      expect(totalWeight).toBe(100);
    });
  });
});