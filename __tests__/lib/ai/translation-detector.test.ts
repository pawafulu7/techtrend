import { describe, it, expect } from '@jest/globals';

describe('Title Translation Detection', () => {
  // 日本語判定ロジック
  const isJapaneseTitle = (title: string): boolean => {
    return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(title);
  };

  // 英語判定（翻訳対象）
  const needsTranslation = (title: string): boolean => {
    if (isJapaneseTitle(title)) return false;
    // アルファベット主体のタイトルは翻訳対象
    return /^[A-Za-z0-9\s\-\.,!?:;()\[\]{}'"]+$/.test(title);
  };

  describe('isJapaneseTitle', () => {
    it('should detect Japanese titles with hiragana', () => {
      expect(isJapaneseTitle('これは日本語のタイトルです')).toBe(true);
    });

    it('should detect Japanese titles with katakana', () => {
      expect(isJapaneseTitle('カタカナタイトル')).toBe(true);
    });

    it('should detect Japanese titles with kanji', () => {
      expect(isJapaneseTitle('技術記事')).toBe(true);
    });

    it('should detect mixed Japanese and English titles as Japanese', () => {
      expect(isJapaneseTitle('Next.js 15の新機能')).toBe(true);
    });

    it('should not detect pure English titles as Japanese', () => {
      expect(isJapaneseTitle('Building Modern Web Applications')).toBe(false);
    });

    it('should not detect alphanumeric titles as Japanese', () => {
      expect(isJapaneseTitle('React 19.0.0 Released')).toBe(false);
    });
  });

  describe('needsTranslation', () => {
    it('should mark English titles for translation', () => {
      expect(needsTranslation('Building Modern Web Applications')).toBe(true);
    });

    it('should mark alphanumeric titles for translation', () => {
      expect(needsTranslation('React 19.0.0 Released')).toBe(true);
    });

    it('should mark titles with special characters for translation', () => {
      expect(needsTranslation('Next.js: The React Framework')).toBe(true);
    });

    it('should not mark Japanese titles for translation', () => {
      expect(needsTranslation('これは日本語のタイトルです')).toBe(false);
    });

    it('should not mark mixed Japanese-English titles for translation', () => {
      expect(needsTranslation('Next.js 15の新機能')).toBe(false);
    });

    it('should handle edge cases correctly', () => {
      expect(needsTranslation('')).toBe(false);
      expect(needsTranslation('   ')).toBe(true); // 空白のみは英語として扱われる
      expect(needsTranslation('123')).toBe(true);
      expect(needsTranslation('!@#$%^')).toBe(false);
    });
  });

  describe('Translation Examples', () => {
    const translationExamples = [
      {
        original: 'Building the Next Generation of Physical Agents with Gemini Robotics-ER 1.5',
        translated: 'Gemini Robotics-ER 1.5による次世代物理エージェントの構築',
        shouldTranslate: true,
      },
      {
        original: 'Control the Temperature: Selective Sampling for Diverse and High-Quality LLM Outputs',
        translated: '温度制御：多様で高品質なLLM出力のための選択的サンプリング',
        shouldTranslate: true,
      },
      {
        original: 'React Server Componentsの実装ガイド',
        translated: null,
        shouldTranslate: false,
      },
      {
        original: 'TypeScript 5.0の新機能まとめ',
        translated: null,
        shouldTranslate: false,
      },
    ];

    it.each(translationExamples)(
      'should correctly determine translation need for "$original"',
      ({ original, shouldTranslate }) => {
        expect(needsTranslation(original)).toBe(shouldTranslate);
      }
    );
  });
});