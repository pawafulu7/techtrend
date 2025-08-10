import {
  checkContentQuality,
  checkEnglishMixing,
  createEnhancedPrompt,
  fixSummary,
  TECHNICAL_TERMS,
} from '@/lib/utils/content-quality-checker';

describe('content-quality-checker', () => {
  describe('checkContentQuality', () => {
    it('should accept high quality content', () => {
      const summary = 'この記事では、ReactのuseStateフックを使った状態管理について詳しく解説しています。初心者にも分かりやすく、実践的なコード例を交えながら説明されており、実務でも活用できる内容となっています。TypeScriptでの型定義方法も含まれています。'; // 160文字
      const detailedSummary = `・ReactのuseStateフックの基本的な使い方から応用まで、段階的に理解できるように構成されている内容となっている
・複数の状態を管理する際のベストプラクティスとアンチパターンを具体例とともに解説している
・パフォーマンスを意識した状態更新の最適化テクニックについて詳しく説明されている
・useReducerとの使い分けや、いつuseStateを選ぶべきかの判断基準を明確に提示している
・実際のアプリケーション開発で遭遇する一般的な問題とその解決策を紹介している`; // 320文字以上
      const title = 'React useStateフック完全ガイド';

      const result = checkContentQuality(summary, detailedSummary, title);

      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.isValid).toBe(true);
      expect(result.issues.length).toBeLessThanOrEqual(2); // フォーマットの軽微な問題は許容
    });

    it('should detect low quality content', () => {
      const summary = 'テスト。';
      const detailedSummary = '・短い\n・内容なし';
      const title = 'テスト';

      const result = checkContentQuality(summary, detailedSummary, title);

      expect(result.score).toBeLessThan(70);
      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.requiresRegeneration).toBe(true);
    });

    it('should detect thin content', () => {
      const summary = 'この記事について解説します。とても参考になる内容が書かれています。初心者から上級者まで幅広く活用できます。';
      const detailedSummary = `・素晴らしい内容が書かれています
・とても参考になる記事です
・初心者にもおすすめです
・実践的な内容です
・読みやすく書かれています`;
      const title = '素晴らしい記事';

      const result = checkContentQuality(summary, detailedSummary, title);

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          type: 'thin_content',
          description: expect.stringContaining('内容が薄い'),
        })
      );
    });

    it('should detect truncation', () => {
      const summary = 'この記事では、プログラミングについて説明していて、初心者向けの内容となっており、'; // 途切れパターン
      const detailedSummary = `・プログラミングの基礎について説明している内容となっている
・初心者にもわかりやすい内容で構成されている
・実践的な例を紹介している記事である
・役立つ情報が満載で参考になる
・読みやすい構成で書かれている`;
      const title = 'プログラミング入門';

      const result = checkContentQuality(summary, detailedSummary, title);

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          type: 'truncation',
          severity: 'critical',
        })
      );
    });

    it('should detect format issues', () => {
      const summary = 'この記事はReactについての記事です。Reactの使い方を説明しています' + 'x'.repeat(100); // 句点なし
      const detailedSummary = `・Reactについて説明している内容となっている
・使い方を解説している記事である
・サンプルコードが付いている
・わかりやすい説明となっている
・実践的な内容で構成されている`;
      const title = 'React入門';

      const result = checkContentQuality(summary, detailedSummary, title);

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          type: 'format',
          severity: 'minor',
          description: expect.stringContaining('句点'),
        })
      );
    });
  });

  describe('checkEnglishMixing', () => {
    it('should detect problematic English mixing', () => {
      const text = 'This システムは React hooks のbest practiceについてexplainしています。performanceのoptimizationもavailableです。';
      
      const result = checkEnglishMixing(text);
      
      expect(result.hasProblematicEnglish).toBe(true);
      expect(result.severity).not.toBe('none');
      expect(result.problematicPhrases.length).toBeGreaterThan(0);
    });

    it('should accept appropriate technical terms', () => {
      const text = 'ReactのuseStateフックを使用して、コンポーネントの状態管理を行います。TypeScriptで型安全な実装が可能です。';
      
      const result = checkEnglishMixing(text);
      
      expect(result.hasProblematicEnglish).toBe(false);
      expect(result.severity).toBe('none');
      expect(result.allowedTerms.length).toBeGreaterThan(0); // React, TypeScript
    });

    it('should handle text without English', () => {
      const text = 'この記事では、最新の技術動向について詳しく解説しています。実践的な例を交えながら説明します。';
      
      const result = checkEnglishMixing(text);
      
      expect(result.hasProblematicEnglish).toBe(false);
      expect(result.severity).toBe('none');
      expect(result.allowedTerms).toHaveLength(0);
    });

    it('should identify critical issues', () => {
      const text = 'これらのシステム is available です。The APIが enabled になっています。';
      
      const result = checkEnglishMixing(text);
      
      expect(result.hasProblematicEnglish).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.problematicPhrases.length).toBeGreaterThan(0);
    });
  });

  describe('createEnhancedPrompt', () => {
    it('should create basic enhanced prompt', () => {
      const title = 'React 19の新機能';
      const content = 'React 19の新機能について解説します...';
      const issues = [];

      const prompt = createEnhancedPrompt(title, content, issues);

      expect(prompt).toContain('React 19の新機能');
      expect(prompt).toContain('技術記事を要約');
      expect(prompt).toContain('150-180文字');
    });

    it('should include language mix issues in prompt', () => {
      const title = 'テスト記事';
      const content = 'テスト内容';
      const issues = [
        { 
          type: 'language_mix', 
          description: '不適切な英語表現が混入', 
          severity: 'major',
          details: {
            hasProblematicEnglish: true,
            problematicPhrases: ['is available', 'This system'],
            allowedTerms: ['API', 'Docker'],
            severity: 'major'
          }
        },
      ];

      const prompt = createEnhancedPrompt(title, content, issues);

      expect(prompt).toContain('特に注意すべき点');
      expect(prompt).toContain('技術用語はそのまま使用可');
      expect(prompt).toContain('日本語に修正');
    });

    it('should handle empty issues', () => {
      const title = 'タイトル';
      const content = 'コンテンツ';
      const issues = [];

      const prompt = createEnhancedPrompt(title, content, issues);

      expect(prompt).toContain('タイトル');
      expect(prompt).toContain('コンテンツ');
      expect(prompt).not.toContain('undefined');
    });
  });

  describe('fixSummary', () => {
    it('should fix language mixing issues', () => {
      const summary = 'This システムは available です';
      const issues = [
        { type: 'language_mix', severity: 'major', description: '英語混入' }
      ];
      
      const fixed = fixSummary(summary, issues);
      
      expect(fixed).toContain('この');
      expect(fixed).toContain('利用可能');
      expect(fixed).not.toContain('This');
      expect(fixed).not.toContain(' is ');
    });

    it('should fix truncation by adding period', () => {
      const summary = 'ReactのuseStateとTypeScriptを使用したAPIの実装について';
      const issues = [
        { type: 'truncation', severity: 'critical', description: '途切れ' }
      ];
      
      const fixed = fixSummary(summary, issues);
      
      expect(fixed).toContain('React');
      expect(fixed).toContain('TypeScript');
      expect(fixed.endsWith('。')).toBe(true);
      expect(fixed).not.toContain('について。'); // 助詞は削除される
    });

    it('should add period if missing', () => {
      const summary = '重要なプロジェクトのタスクを完了しました';
      const issues = [
        { type: 'format', severity: 'minor', description: '句点で終わっていない' }
      ];
      
      const fixed = fixSummary(summary, issues);
      
      expect(fixed.endsWith('。')).toBe(true);
      expect(fixed.endsWith('。。')).toBe(false); // 二重句点防止
    });

    it('should handle empty issues', () => {
      const summary = '正常な要約です。';
      const issues = [];
      
      const fixed = fixSummary(summary, issues);
      
      expect(fixed).toBe('正常な要約です。');
    });
  });

  describe('TECHNICAL_TERMS constant', () => {
    it('should contain common technical terms', () => {
      expect(TECHNICAL_TERMS.has('React')).toBe(true);
      expect(TECHNICAL_TERMS.has('JavaScript')).toBe(true);
      expect(TECHNICAL_TERMS.has('TypeScript')).toBe(true);
      expect(TECHNICAL_TERMS.has('API')).toBe(true);
      expect(TECHNICAL_TERMS.has('MySQL')).toBe(true);
    });

    it('should be a Set', () => {
      expect(TECHNICAL_TERMS).toBeInstanceOf(Set);
    });

    it('should have reasonable size', () => {
      expect(TECHNICAL_TERMS.size).toBeGreaterThan(50);
      expect(TECHNICAL_TERMS.size).toBeLessThan(500);
    });
  });
});