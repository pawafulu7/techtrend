import { detectArticleType, getArticleTypeLabel, getArticleTypeDescription } from '@/lib/utils/article-type-detector';

describe('article-type-detector', () => {
  describe('detectArticleType', () => {
    // リリース型のテスト
    test('should detect release type articles', () => {
      const releaseTitles = [
        'AWS announces new Lambda feature',
        'React 18 Released with Concurrent Features',
        'Google launches new AI model',
        'Next.js 14 now available',
        'TypeScriptが新機能をリリース',
        'Vue.js 3.4が公開されました'
      ];
      
      releaseTitles.forEach(title => {
        expect(detectArticleType(title)).toBe('release');
      });
    });
    
    // チュートリアル型のテスト
    test('should detect tutorial type articles', () => {
      const tutorialTitles = [
        'How to build a REST API with Node.js',
        'Getting started with React Hooks',
        'Step by step guide to Docker',
        'React入門: はじめてのコンポーネント',
        'TypeScriptの使い方完全ガイド'
      ];
      
      tutorialTitles.forEach(title => {
        expect(detectArticleType(title)).toBe('tutorial');
      });
    });
    
    // 技術紹介型のテスト
    test('should detect tech-intro type articles', () => {
      const techIntroTitles = [
        'What is GraphQL?',
        'Introduction to Machine Learning',
        'Understanding React Server Components',
        'WebAssemblyとは何か',
        'Dockerについて知っておくべきこと'
      ];
      
      techIntroTitles.forEach(title => {
        expect(detectArticleType(title)).toBe('tech-intro');
      });
    });
    
    // 実装レポート型のテスト
    test('should detect implementation type articles', () => {
      const implementationTitles = [
        'Building a Todo App with Vue.js',
        'I built a Chrome extension in a weekend',
        'We created our design system',
        'Reactでポモドーロタイマーを作った',
        'TypeScriptでCLIツールを開発しました'
      ];
      
      implementationTitles.forEach(title => {
        expect(detectArticleType(title)).toBe('implementation');
      });
    });
    
    // 問題解決型のテスト
    test('should detect problem-solving type articles', () => {
      const problemSolvingTitles = [
        'Fixing memory leaks in React',
        'Solving N+1 query problems',
        'Debugging Node.js performance issues',
        'メモリリークを解決する方法',
        'パフォーマンスを改善する10の方法'
      ];
      
      problemSolvingTitles.forEach(title => {
        expect(detectArticleType(title)).toBe('problem-solving');
      });
    });
    
    // コンテンツを含むテスト
    test('should consider content when detecting type', () => {
      const title = 'My latest project';
      const content = 'I built this amazing web application using React and TypeScript...';
      
      expect(detectArticleType(title, content)).toBe('implementation');
    });
    
    // デフォルトのテスト
    test('should default to problem-solving for unclear titles', () => {
      const unclearTitles = [
        'Thoughts on software development',
        'Weekly tech roundup',
        '技術ブログを始めました'
      ];
      
      unclearTitles.forEach(title => {
        expect(detectArticleType(title)).toBe('problem-solving');
      });
    });
  });
  
  describe('getArticleTypeLabel', () => {
    test('should return correct Japanese labels', () => {
      expect(getArticleTypeLabel('release')).toBe('新機能リリース');
      expect(getArticleTypeLabel('problem-solving')).toBe('問題解決');
      expect(getArticleTypeLabel('tutorial')).toBe('チュートリアル');
      expect(getArticleTypeLabel('tech-intro')).toBe('技術紹介');
      expect(getArticleTypeLabel('implementation')).toBe('実装レポート');
    });
  });
  
  describe('getArticleTypeDescription', () => {
    test('should return correct descriptions', () => {
      expect(getArticleTypeDescription('release')).toContain('新しい機能');
      expect(getArticleTypeDescription('problem-solving')).toContain('技術的な問題');
      expect(getArticleTypeDescription('tutorial')).toContain('学習ガイド');
      expect(getArticleTypeDescription('tech-intro')).toContain('概要説明');
      expect(getArticleTypeDescription('implementation')).toContain('個人プロジェクト');
    });
  });
});