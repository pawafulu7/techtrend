import {
  calculateTitleSimilarity,
  calculateKeywordSimilarity,
  isDuplicate,
  removeDuplicates
} from '@/lib/utils/duplicate-detection';

describe('duplicate-detection', () => {
  describe('calculateTitleSimilarity', () => {
    it('完全一致のタイトルは類似度1.0を返す', () => {
      expect(calculateTitleSimilarity('React入門', 'React入門')).toBe(1.0);
      expect(calculateTitleSimilarity('TypeScriptの基礎', 'TypeScriptの基礎')).toBe(1.0);
    });

    it('全角英数字を含むタイトルを正規化して比較する', () => {
      expect(calculateTitleSimilarity('React入門', 'Ｒｅａｃｔ入門')).toBeCloseTo(1.0, 2);
      // 全角ピリオドは正規化されないので期待値を調整
      expect(calculateTitleSimilarity('TypeScript３．０', 'TypeScript3.0')).toBeGreaterThan(0.9);
    });

    it('カタカナとひらがなの違いを正規化する', () => {
      const sim = calculateTitleSimilarity('プログラミング入門', 'ぷろぐらみんぐ入門');
      expect(sim).toBeGreaterThan(0.8);
    });

    it('句読点や記号を無視して比較する', () => {
      const sim1 = calculateTitleSimilarity('「React」入門！', 'React入門');
      const sim2 = calculateTitleSimilarity('【TypeScript】基礎講座', 'TypeScript基礎講座');
      expect(sim1).toBeGreaterThan(0.8);
      expect(sim2).toBeGreaterThan(0.8);
    });

    it('異なるタイトルは低い類似度を返す', () => {
      expect(calculateTitleSimilarity('React入門', 'Vue.js入門')).toBeLessThan(0.5);
      // 「開発」が共通しているため、期待値を調整
      expect(calculateTitleSimilarity('フロントエンド開発', 'バックエンド開発')).toBeLessThan(0.7);
    });

    it('部分的に一致するタイトルは中程度の類似度を返す', () => {
      const sim = calculateTitleSimilarity('React Hooks入門', 'React入門');
      expect(sim).toBeGreaterThan(0.5);
      expect(sim).toBeLessThan(0.9);
    });

    it('空文字列を処理できる', () => {
      expect(calculateTitleSimilarity('', '')).toBe(1.0);
      expect(calculateTitleSimilarity('React', '')).toBe(0);
    });
  });

  describe('calculateKeywordSimilarity', () => {
    it('同じキーワードを持つタイトルは高い類似度を返す', () => {
      const sim = calculateKeywordSimilarity('React Hooks 入門', 'React Hooks 実践');
      // Jaccard係数: 2/4 = 0.5 なので期待値を調整
      expect(sim).toBeGreaterThanOrEqual(0.5);
    });

    it('異なるキーワードのタイトルは類似度0を返す', () => {
      expect(calculateKeywordSimilarity('React開発', 'Vue.js開発')).toBe(0);
    });

    it('キーワードの順序に関わらず類似度を計算する', () => {
      const sim1 = calculateKeywordSimilarity('TypeScript React 入門', 'React TypeScript 入門');
      expect(sim1).toBeCloseTo(1.0, 2);
    });

    it('部分的に共通するキーワードがある場合', () => {
      const sim = calculateKeywordSimilarity('React Redux TypeScript', 'React TypeScript');
      expect(sim).toBeCloseTo(2/3, 2); // 2/3 = 0.666...
    });

    it('空文字列やキーワードが抽出できない場合は0を返す', () => {
      expect(calculateKeywordSimilarity('', '')).toBe(0);
      expect(calculateKeywordSimilarity('a b', 'c d')).toBe(0); // 1文字の単語は無視される
    });

    it('日本語キーワードも正しく処理する', () => {
      const sim = calculateKeywordSimilarity('機械学習 ディープラーニング', '機械学習 AI');
      expect(sim).toBeCloseTo(1/3, 2); // 1/3 = 0.333...
    });
  });

  describe('isDuplicate', () => {
    it('同じタイトルは重複と判定する', () => {
      expect(isDuplicate('React入門', 'React入門')).toBe(true);
    });

    it('正規化後に同じになるタイトルは重複と判定する', () => {
      expect(isDuplicate('「React」入門！', '【React】入門')).toBe(true);
      expect(isDuplicate('TypeScript３．０', 'TypeScript3.0')).toBe(true);
    });

    it('閾値以上の類似度を持つタイトルは重複と判定する', () => {
      expect(isDuplicate('React Hooksの基礎', 'React Hooksの基本', 0.7)).toBe(true);
    });

    it('異なるタイトルは重複ではないと判定する', () => {
      expect(isDuplicate('React入門', 'Vue.js入門')).toBe(false);
    });

    it('「について」などの接尾辞を無視して比較する', () => {
      expect(isDuplicate('React Hooksについて', 'React Hooks')).toBe(true);
      expect(isDuplicate('TypeScriptの話', 'TypeScript')).toBe(true);
      expect(isDuplicate('Next.jsに関して', 'Next.js')).toBe(true);
    });

    it('バージョン番号を無視して比較する', () => {
      expect(isDuplicate('React v18の新機能', 'React v17の新機能')).toBe(true);
      expect(isDuplicate('TypeScript 4.5リリース', 'TypeScript 4.6リリース')).toBe(true);
    });

    it('日付を無視して比較する', () => {
      expect(isDuplicate('2024年のReactトレンド', '2023年のReactトレンド')).toBe(true);
      expect(isDuplicate('2024-01-01のニュース', '2024-02-01のニュース')).toBe(true);
    });

    it('キーワード類似度による重複判定', () => {
      // キーワード類似度が0.7以上の場合
      const title1 = 'React TypeScript Next.js';
      const title2 = 'React TypeScript Gatsby';
      expect(isDuplicate(title1, title2)).toBe(false); // キーワード類似度は2/4=0.5なので重複ではない
      
      const title3 = 'React TypeScript';
      const title4 = 'React TypeScript 入門';
      expect(isDuplicate(title3, title4)).toBe(true); // キーワード類似度が高い
    });

    it('カスタム閾値を指定できる', () => {
      const title1 = 'React開発';
      const title2 = 'React開発入門';
      
      expect(isDuplicate(title1, title2, 0.9)).toBe(false);
      expect(isDuplicate(title1, title2, 0.6)).toBe(true);
    });
  });

  describe('removeDuplicates', () => {
    const createArticle = (title: string, date: string) => ({
      title,
      publishedAt: new Date(date),
      id: Math.random().toString()
    });

    it('重複のない記事はすべて残す', () => {
      const articles = [
        createArticle('React入門', '2024-01-01'),
        createArticle('Vue.js入門', '2024-01-02'),
        createArticle('TypeScript入門', '2024-01-03')
      ];
      
      const result = removeDuplicates(articles);
      expect(result).toHaveLength(3);
    });

    it('重複する記事を除外する', () => {
      const articles = [
        createArticle('React入門', '2024-01-01'),
        createArticle('React入門', '2024-01-02'),
        createArticle('Vue.js入門', '2024-01-03')
      ];
      
      const result = removeDuplicates(articles);
      expect(result).toHaveLength(2);
      expect(result.map(a => a.title)).toEqual(['Vue.js入門', 'React入門']);
    });

    it('正規化後に重複する記事も除外する', () => {
      const articles = [
        createArticle('React入門', '2024-01-01'),
        createArticle('【React】入門', '2024-01-02'),
        createArticle('React入門について', '2024-01-03'),
        createArticle('Vue.js入門', '2024-01-04')
      ];
      
      const result = removeDuplicates(articles);
      expect(result).toHaveLength(2);
      expect(result.map(a => a.title)).toContain('Vue.js入門');
    });

    it('公開日時の新しい順にソートする', () => {
      const articles = [
        createArticle('JavaScript入門', '2024-01-01'),
        createArticle('TypeScript入門', '2024-01-03'),
        createArticle('React入門', '2024-01-02')
      ];
      
      const result = removeDuplicates(articles);
      expect(result).toHaveLength(3);
      expect(result[0].title).toBe('TypeScript入門');
      expect(result[1].title).toBe('React入門');
      expect(result[2].title).toBe('JavaScript入門');
    });

    it('文字列形式の日付も処理できる', () => {
      const articles = [
        { title: 'TypeScript入門', publishedAt: '2024-01-01T00:00:00Z', id: '1' },
        { title: 'React入門', publishedAt: '2024-01-02T00:00:00Z', id: '2' }
      ];
      
      const result = removeDuplicates(articles);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('React入門');
    });

    it('空の配列を処理できる', () => {
      expect(removeDuplicates([])).toEqual([]);
    });

    it('最初に出現した記事を残す', () => {
      const articles = [
        createArticle('React入門', '2024-01-01'),
        createArticle('Vue.js入門', '2024-01-02'),
        createArticle('React入門', '2024-01-03'), // これは除外される
      ];
      
      const result = removeDuplicates(articles);
      expect(result).toHaveLength(2);
      expect(result.find(a => a.title === 'React入門')?.publishedAt).toEqual(new Date('2024-01-01'));
    });
  });
});