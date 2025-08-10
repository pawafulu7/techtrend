import {
  checkSummaryQuality,
  calculateQualityStats,
  generateQualityReport,
  expandSummaryIfNeeded,
  isQualityCheckEnabled,
  getMinQualityScore,
  getMaxRegenerationAttempts,
} from '@/lib/utils/summary-quality-checker';

describe('summary-quality-checker', () => {
  describe('checkSummaryQuality', () => {
    describe('valid summaries', () => {
      it('should accept well-formatted summary', () => {
        // 文字数の最小要件を満たすテストデータ
        const summary = 'この記事では、React 19の新機能について詳しく解説しています。特に、新しいフックの使い方と、パフォーマンスの向上について重点的に説明しています。開発者にとって重要な変更点を網羅的に紹介し、実装例も豊富に掲載されています。実際のプロジェクトで活用できる実践的な内容となっており、初心者から上級者まで幅広く参考になる記事です。'; // 160文字
        const detailedSummary = `・React 19で追加された新しいuseフックの詳細な使い方と実装例を紹介し、従来のフックとの違いやマイグレーション方法について、実際のコードサンプルを交えながら丁寧に解説している点が特に参考になる内容となっている
・Server Componentsの本格導入による、サーバーサイドレンダリングの性能向上とSEO最適化のメリットを具体的な数値とともに説明し、実装における注意点も詳しく述べているため、実践的な知識が得られる構成になっている
・Suspenseの改善により、データ取得時のローディング状態の管理がより簡潔になり、ユーザー体験が大幅に向上したことを、具体的な実装パターンとともに詳述しているので、すぐに実際のプロジェクトで活用できる
・自動バッチング機能の強化で、複数の状態更新が効率的に処理されるようになった仕組みと、パフォーマンスへの影響を技術的に解説し、最適化のベストプラクティスを紹介している点が非常に有益である
・並行レンダリング機能により、ユーザー体験が向上し、より滑らかなインタラクションが実現可能になった実装パターンを、実際のアプリケーションでの活用例とともに紹介しているため、実装イメージが湧きやすい内容`; // 500文字以上
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        expect(result.isValid).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(70);
        expect(result.requiresRegeneration).toBe(false);
        expect(result.issues).toHaveLength(0);
      });

      it('should accept summary with ideal length', () => {
        const summary = 'x'.repeat(170) + '。'; // 171文字（理想的な長さ）
        const detailedSummary = ['・' + 'x'.repeat(100)].concat(
          Array(4).fill(0).map(() => '・' + 'y'.repeat(100))
        ).join('\n'); // 5つの箇条書き、各100文字
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        expect(result.isValid).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(85);
      });
    });

    describe('summary length validation', () => {
      it('should detect too short summary', () => {
        const summary = '短い要約です。'; // 7文字
        const detailedSummary = `・` + 'x'.repeat(100) + '\n'.repeat(4) + '・' + 'y'.repeat(100);
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        expect(result.isValid).toBe(false);
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            type: 'length',
            severity: 'major',
            message: expect.stringContaining('一覧要約が短すぎる')
          })
        );
        expect(result.score).toBeLessThan(100);
      });

      it('should detect too long summary', () => {
        const summary = 'x'.repeat(201) + '。'; // 202文字
        const detailedSummary = Array(5).fill(0).map(() => '・' + 'x'.repeat(100)).join('\n');
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            type: 'length',
            severity: 'major',
            message: expect.stringContaining('一覧要約が長すぎる')
          })
        );
      });

      it('should warn for short but acceptable summary', () => {
        const summary = 'x'.repeat(75) + '。'; // 76文字
        const detailedSummary = Array(5).fill(0).map(() => '・' + 'x'.repeat(100)).join('\n');
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        expect(result.isValid).toBe(true); // 50文字以上なので有効
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            type: 'length',
            severity: 'minor',
            message: expect.stringContaining('一覧要約が短め')
          })
        );
      });

      it('should warn about slightly long summary', () => {
        const summary = 'x'.repeat(181) + '。'; // 182文字
        const detailedSummary = Array(5).fill(0).map(() => '・' + 'x'.repeat(100)).join('\n');
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            type: 'length',
            severity: 'minor',
            message: expect.stringContaining('一覧要約がやや長い')
          })
        );
      });
    });

    describe('detailed summary length validation', () => {
      it('should detect too short detailed summary', () => {
        const summary = 'x'.repeat(170) + '。';
        const detailedSummary = '・短い詳細\n・短い\n・短い\n・短い\n・短い'; // 短すぎる
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            type: 'length',
            severity: 'major',
            message: expect.stringContaining('詳細要約が短すぎる')
          })
        );
      });

      it('should warn about slightly long detailed summary', () => {
        const summary = 'x'.repeat(170) + '。';
        const detailedSummary = Array(5).fill(0).map(() => '・' + 'x'.repeat(130)).join('\n'); // 650文字+
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            type: 'length',
            severity: 'minor',
            message: expect.stringContaining('詳細要約が理想より長い')
          })
        );
      });

      it('should detect too long detailed summary', () => {
        const summary = 'x'.repeat(170) + '。';
        const detailedSummary = Array(5).fill(0).map(() => '・' + 'x'.repeat(150)).join('\n'); // 750文字+
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            type: 'length',
            severity: 'minor',
            message: expect.stringContaining('詳細要約がやや長い')
          })
        );
      });
    });

    describe('format validation', () => {
      it('should require exactly 5 bullet points', () => {
        const summary = 'x'.repeat(170) + '。';
        const detailedSummary = '・ポイント1\n・ポイント2\n・ポイント3'; // 3つしかない
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            type: 'format',
            severity: 'critical',
            message: expect.stringContaining('箇条書きが3個（必須5個）')
          })
        );
        expect(result.requiresRegeneration).toBe(true);
      });

      it('should detect non-bullet lines', () => {
        const summary = 'x'.repeat(170) + '。';
        const detailedSummary = `説明文が混入しています
・ポイント1について詳しく説明
・ポイント2について詳しく説明
・ポイント3について詳しく説明
・ポイント4について詳しく説明
・ポイント5について詳しく説明`;
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            type: 'format',
            severity: 'major',
            message: '詳細要約に箇条書き以外の行が含まれている'
          })
        );
      });

      it('should check bullet point length', () => {
        const summary = 'x'.repeat(170) + '。';
        const detailedSummary = `・短い
・` + 'x'.repeat(100) + `
・` + 'x'.repeat(100) + `
・` + 'x'.repeat(100) + `
・` + 'x'.repeat(130); // 1つ目が短すぎ、5つ目が長すぎ
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        const lengthIssues = result.issues.filter(i => 
          i.type === 'format' && i.message.includes('文字数が不適切')
        );
        expect(lengthIssues.length).toBeGreaterThan(0);
      });
    });

    describe('punctuation validation', () => {
      it('should require period at end of summary', () => {
        const summary = 'x'.repeat(170); // 句点なし
        const detailedSummary = Array(5).fill(0).map(() => '・' + 'x'.repeat(100)).join('\n');
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            type: 'punctuation',
            severity: 'minor',
            message: '一覧要約が句点で終わっていない'
          })
        );
      });

      it('should detect period at end of bullet points', () => {
        const summary = 'x'.repeat(170) + '。';
        const detailedSummary = Array(5).fill(0).map(() => '・' + 'x'.repeat(100) + '。').join('\n');
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        const punctuationIssues = result.issues.filter(i => 
          i.type === 'punctuation' && i.message.includes('箇条書き')
        );
        expect(punctuationIssues).toHaveLength(5);
      });
    });

    describe('score calculation', () => {
      it('should calculate perfect score for ideal summary', () => {
        const summary = 'x'.repeat(169) + '。'; // 170文字
        const detailedSummary = Array(5).fill(0).map(() => '・' + 'x'.repeat(100)).join('\n');
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        expect(result.score).toBe(100);
        expect(result.isValid).toBe(true);
        expect(result.requiresRegeneration).toBe(false);
      });

      it('should mark as invalid when score below 70', () => {
        const summary = '短い。'; // 3文字
        const detailedSummary = '・短い\n・短い'; // 2つしかない
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        expect(result.score).toBeLessThan(70);
        expect(result.isValid).toBe(false);
        expect(result.requiresRegeneration).toBe(true);
      });

      it('should require regeneration with critical issues', () => {
        const summary = 'x'.repeat(170) + '。';
        const detailedSummary = '・ポイント1\n・ポイント2'; // 2つしかない（critical）
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        expect(result.requiresRegeneration).toBe(true);
        expect(result.issues.some(i => i.severity === 'critical')).toBe(true);
      });

      it('should require regeneration with multiple major issues', () => {
        const summary = '短い。'; // major issue
        const detailedSummary = '・' + 'x'.repeat(10) + '\n'.repeat(4) + '・' + 'x'.repeat(10); // major issue
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        const majorIssues = result.issues.filter(i => i.severity === 'major');
        expect(majorIssues.length).toBeGreaterThanOrEqual(2);
        expect(result.requiresRegeneration).toBe(true);
      });

      it('should not go below 0 score', () => {
        const summary = ''; // 多くの問題
        const detailedSummary = ''; // 多くの問題
        
        const result = checkSummaryQuality(summary, detailedSummary);
        
        expect(result.score).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('calculateQualityStats', () => {
    it('should calculate statistics for quality results', () => {
      const results = [
        { score: 100, isValid: true, issues: [], requiresRegeneration: false },
        { score: 80, isValid: true, issues: [{ type: 'length', severity: 'minor', message: 'test' }], requiresRegeneration: false },
        { score: 60, isValid: false, issues: [{ type: 'format', severity: 'major', message: 'test' }], requiresRegeneration: true },
      ];
      
      const stats = calculateQualityStats(results);
      
      expect(stats.averageScore).toBe(80);
      expect(stats.validCount).toBe(2);
      expect(stats.invalidCount).toBe(1);
      expect(stats.regenerationRate).toBe(33); // 1/3 * 100
      expect(stats.minorIssuesCount).toBe(1);
      expect(stats.majorIssuesCount).toBe(1);
      expect(stats.criticalIssuesCount).toBe(0);
    });

    it('should handle empty results', () => {
      const stats = calculateQualityStats([]);
      
      expect(stats.averageScore).toBe(0);
      expect(stats.validCount).toBe(0);
      expect(stats.invalidCount).toBe(0);
      expect(stats.regenerationRate).toBe(0);
      expect(stats.criticalIssuesCount).toBe(0);
      expect(stats.majorIssuesCount).toBe(0);
      expect(stats.minorIssuesCount).toBe(0);
    });
  });

  describe('generateQualityReport', () => {
    it('should generate markdown report', () => {
      const result = { 
        score: 60, 
        isValid: false, 
        issues: [
          { type: 'format', severity: 'major', message: 'Format issue' },
          { type: 'length', severity: 'minor', message: 'Length issue' }
        ], 
        requiresRegeneration: true
      };
      
      const report = generateQualityReport(result);
      
      expect(report).toContain('品質スコア: 60/100');
      expect(report).toContain('判定: ❌ 不合格');
      expect(report).toContain('再生成必要: はい');
      expect(report).toContain('問題点:');
      expect(report).toContain('🟡 [major] Format issue');
      expect(report).toContain('🔵 [minor] Length issue');
    });

    it('should handle no issues', () => {
      const result = { 
        score: 100, 
        isValid: true, 
        issues: [], 
        requiresRegeneration: false
      };
      
      const report = generateQualityReport(result);
      
      expect(report).toContain('品質スコア: 100/100');
      expect(report).toContain('判定: ✅ 合格');
      expect(report).toContain('再生成必要: いいえ');
      expect(report).not.toContain('問題点:');
    });
  });

  describe('expandSummaryIfNeeded', () => {
    it('should not expand valid summary', () => {
      const summary = 'x'.repeat(160) + '。';
      const expanded = expandSummaryIfNeeded(summary, '', 150, '');
      
      expect(expanded).toBe(summary);
    });

    it('should not expand summary over 50 chars', () => {
      const summary = 'x'.repeat(60) + '。'; // 61文字
      const expanded = expandSummaryIfNeeded(summary, '', 150, '');
      
      expect(expanded).toBe(summary); // 50文字以上なのでそのまま返される
    });

    it('should expand very short summary', () => {
      const summary = '短い要約です。'; // 7文字
      const title = 'テスト記事のタイトル';
      const content = 'これは記事の本文です。詳細な内容が含まれています。';
      
      const expanded = expandSummaryIfNeeded(summary, title, 150, content);
      
      expect(expanded.length).toBeGreaterThanOrEqual(30); // 最低30文字は確保
      expect(expanded).toMatch(/。$/); // 句点で終わる
    });

    it('should expand with title when very short', () => {
      const veryShort = '短い。'; // 3文字
      const title = '技術記事のタイトル';
      const expanded = expandSummaryIfNeeded(veryShort, title, 150, '');
      
      // 「技術記事のタイトルに関する記事。」のような形式になる
      expect(expanded).toContain(title); // タイトルが含まれる
      expect(expanded).toContain('に関する記事');
      expect(expanded).toMatch(/。$/); // 句点で終わる
    });

    it('should use content for expansion', () => {
      const summary = 'とても短い要約。'; // 8文字
      const content = 'これは記事の内容です。詳しい説明が含まれています。技術的な詳細も記載されています。';
      const expanded = expandSummaryIfNeeded(summary, '', 150, content);
      
      expect(expanded.length).toBeGreaterThanOrEqual(30);
      expect(expanded).toMatch(/。$/); // 句点で終わる
    });

    it('should ensure result ends with period', () => {
      const summary = '短い';
      const expanded = expandSummaryIfNeeded(summary, '', 150, '');
      
      expect(expanded).toMatch(/。$/);
    });

    it('should return as-is if over 50 chars even with higher minLength', () => {
      const summary = 'x'.repeat(60) + '。'; // 61文字
      const expanded = expandSummaryIfNeeded(summary, '', 200, '');
      
      // 50文字以上あるのでそのまま返される（200文字に達していなくても）
      expect(expanded).toBe(summary);
    });
  });

  describe('environment variable helpers', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    describe('isQualityCheckEnabled', () => {
      it('should return true by default', () => {
        delete process.env.QUALITY_CHECK_ENABLED;
        expect(isQualityCheckEnabled()).toBe(true);
      });

      it('should return true when enabled', () => {
        process.env.QUALITY_CHECK_ENABLED = 'true';
        expect(isQualityCheckEnabled()).toBe(true);
      });

      it('should return false when disabled', () => {
        process.env.QUALITY_CHECK_ENABLED = 'false';
        expect(isQualityCheckEnabled()).toBe(false);
      });
    });

    describe('getMinQualityScore', () => {
      it('should return 70 by default', () => {
        delete process.env.QUALITY_MIN_SCORE;
        expect(getMinQualityScore()).toBe(70);
      });

      it('should return custom value', () => {
        process.env.QUALITY_MIN_SCORE = '80';
        expect(getMinQualityScore()).toBe(80);
      });

      it('should return default for invalid value', () => {
        process.env.QUALITY_MIN_SCORE = 'invalid';
        expect(getMinQualityScore()).toBe(70);
      });
    });

    describe('getMaxRegenerationAttempts', () => {
      it('should return 3 by default', () => {
        delete process.env.MAX_REGENERATION_ATTEMPTS;
        expect(getMaxRegenerationAttempts()).toBe(3);
      });

      it('should return custom value', () => {
        process.env.MAX_REGENERATION_ATTEMPTS = '5';
        expect(getMaxRegenerationAttempts()).toBe(5);
      });

      it('should return default for invalid value', () => {
        process.env.MAX_REGENERATION_ATTEMPTS = 'invalid';
        expect(getMaxRegenerationAttempts()).toBe(3);
      });
    });
  });
});